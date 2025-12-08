import { Database } from 'sql.js';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { saveDatabase, logAudit } from './database';
import { buildEMRToCustomerMap, getOrCreateCustomerByEMRId } from './customer-crosswalk';
import { parseDate } from './date-utils';

interface EMRRow {
  Date: Date;
  'Invoice #': string;
  CID: number;
  customer_id: string;
  Name: string | null;  // Customer/Patient name
  'First Name': string | null;
  'Last Name': string | null;
  'Service/Product': string | null;
  SKU: number | null;
  Staff: string | null;
  QTY: number | null;
  Price: number | null;
  Discounts: number | null;
  Tax: number | null;
  'Total Due': number | null;
  Amount: number | null;
  'Payment Type': string | null;
}

interface ProcessingResult {
  success: boolean;
  uploadId: string;
  stats: {
    totalRows: number;
    invoiceCount: number;
    serviceLines: number;
    paymentLines: number;
    unmappedServices: string[];
    unmappedPaymentTypes: string[];
    customersMatched: number;
    newCustomersCreated: number;
  };
  error?: string;
}

interface ServiceMapping {
  emr_service_name: string;
  qb_item_name: string;
  income_account: string;
  tax_code: string | null;
}

interface PaymentTypeMapping {
  payment_type: string;
  category: string;
  clearing_account: string;
}

/**
 * Process an EMR transactions Excel file
 */
export function processEMRFile(
  db: Database,
  dbPath: string,
  filePath: string
): ProcessingResult {
  const uploadId = uuidv4();

  try {
    console.log(`Processing EMR file: ${filePath}`);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        uploadId,
        stats: { totalRows: 0, invoiceCount: 0, serviceLines: 0, paymentLines: 0, unmappedServices: [], unmappedPaymentTypes: [], customersMatched: 0, newCustomersCreated: 0 },
        error: `File not found: ${filePath}`
      };
    }

    // Read the Excel file
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<EMRRow>(sheet);

    console.log(`Found ${data.length} rows in EMR file`);

    // Load service mappings from database
    const serviceMappings = loadServiceMappings(db);
    const paymentTypeMappings = loadPaymentTypeMappings(db);
    const emrToCustomerMap = buildEMRToCustomerMap(db);

    console.log(`Loaded ${serviceMappings.size} service mappings`);
    console.log(`Loaded ${paymentTypeMappings.size} payment type mappings`);
    console.log(`Loaded ${emrToCustomerMap.size} EMR->Customer mappings`);

    // Create file upload record
    const filename = filePath.split(/[/\\]/).pop() || 'unknown.xlsx';
    db.run(
      `INSERT INTO file_uploads (id, filename, file_type, row_count, status) VALUES (?, ?, ?, ?, 'processing')`,
      [uploadId, filename, 'emr_transactions', data.length]
    );

    // Process rows
    const stats = {
      totalRows: data.length,
      invoiceCount: 0,
      serviceLines: 0,
      paymentLines: 0,
      unmappedServices: new Set<string>(),
      unmappedPaymentTypes: new Set<string>(),
      customersMatched: 0,
      newCustomersCreated: 0
    };

    const seenInvoices = new Set<string>();
    const processedCustomers = new Set<string>(); // Track CIDs we've already processed

    for (const row of data) {
      const transactionId = uuidv4();
      const invoiceNumber = String(row['Invoice #'] || '');
      const cid = String(row.CID || '');
      const serviceName = row['Service/Product'] || null;
      const paymentType = row['Payment Type'] || null;
      const txnDate = parseDate(row.Date);

      // Get customer name from EMR row (Name field, or First Name + Last Name)
      let customerName: string | null = row.Name || null;
      if (!customerName && (row['First Name'] || row['Last Name'])) {
        customerName = [row['First Name'], row['Last Name']].filter(Boolean).join(' ').trim() || null;
      }

      // Resolve customer UUID from EMR patient ID (CID)
      let customerId: string | null = null;
      if (cid && !processedCustomers.has(cid)) {
        processedCustomers.add(cid);
        // Check if already in the crosswalk
        if (emrToCustomerMap.has(cid)) {
          customerId = emrToCustomerMap.get(cid)!;
          stats.customersMatched++;

          // Update stg_emr_patients with name if we have one and it doesn't exist yet
          if (customerName) {
            db.run(`
              INSERT INTO stg_emr_patients (emr_patient_id, full_name, customer_id)
              VALUES (?, ?, ?)
              ON CONFLICT(emr_patient_id) DO UPDATE SET
                full_name = COALESCE(stg_emr_patients.full_name, excluded.full_name),
                customer_id = COALESCE(stg_emr_patients.customer_id, excluded.customer_id)
            `, [cid, customerName, customerId]);
          }
        } else {
          // Create new customer with UUID from pool, passing the name
          const result = getOrCreateCustomerByEMRId(db, dbPath, cid, customerName || undefined);
          customerId = result.customerId;
          emrToCustomerMap.set(cid, customerId); // Update local map
          stats.newCustomersCreated++;
        }
      } else if (cid) {
        customerId = emrToCustomerMap.get(cid) || null;
      }

      // Track unique invoices
      if (invoiceNumber && !seenInvoices.has(invoiceNumber)) {
        seenInvoices.add(invoiceNumber);
        stats.invoiceCount++;
      }

      // Determine if this is a service line or payment line
      const isServiceLine = serviceName !== null && serviceName !== '';
      const isPaymentLine = paymentType !== null && paymentType !== '';

      // STORE NON-CASH PAYMENT LINES - to match with Gravity payments
      if (isPaymentLine && !isServiceLine) {
        stats.paymentLines++;

        // Only store non-cash payments (Gravity handles non-cash payments)
        const isCashPayment = paymentType && paymentType.toLowerCase().includes('cash');

        if (!isCashPayment && customerName && invoiceNumber) {
          const paymentAmount = row.Price || row.Amount || 0;

          if (paymentAmount > 0) {
            const paymentId = uuidv4();

            db.run(`
              INSERT INTO stg_emr_payments (
                id, upload_id, customer_cid, customer_id, customer_name,
                invoice_number, transaction_date, payment_type, payment_amount
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              paymentId,
              uploadId,
              cid,
              customerId,
              customerName,
              invoiceNumber,
              txnDate,
              paymentType,
              paymentAmount
            ]);
          }
        }

        continue;
      }

      // Only process service lines
      if (isServiceLine) {
        stats.serviceLines++;

        // Check service mapping (using normalized key for case-insensitive matching)
        const serviceMapping = serviceMappings.get(normalizeKey(serviceName));
        if (!serviceMapping) {
          stats.unmappedServices.add(serviceName);
        }
      } else {
        // Skip rows with no service
        continue;
      }

      // Build mapped data JSON (using normalized keys for case-insensitive matching)
      const mappedData: any = {};
      if (serviceName && serviceMappings.has(normalizeKey(serviceName))) {
        const sm = serviceMappings.get(normalizeKey(serviceName))!;
        mappedData.qb_item = sm.qb_item_name;
        mappedData.income_account = sm.income_account;
        mappedData.tax_code = sm.tax_code;
      }

      // Calculate amount for service lines as QTY * Price
      // (Amount field in EMR is 0 for service lines; actual amount is in separate payment records)
      const quantity = row.QTY || 0;
      const price = row.Price || 0;
      const serviceAmount = quantity * price;

      // Insert into staging table (with customer_id UUID) - SERVICES ONLY
      db.run(`
        INSERT INTO transactions_staging (
          id, upload_id, customer_cid, customer_id, invoice_number, transaction_date,
          service_name, quantity, price, amount, payment_type,
          transaction_data, mapped_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        transactionId,
        uploadId,
        cid,
        customerId,
        invoiceNumber,
        txnDate,
        serviceName,
        row.QTY || null,
        row.Price || null,
        serviceAmount,
        null, // No payment type for service lines
        JSON.stringify({
          sku: row.SKU,
          staff: row.Staff,
          discounts: row.Discounts,
          tax: row.Tax,
          totalDue: row['Total Due'],
          customerId: row.customer_id
        }),
        JSON.stringify(mappedData)
      ]);
    }

    // Update file upload status
    db.run(
      `UPDATE file_uploads SET status = 'processed', processed_at = datetime('now') WHERE id = ?`,
      [uploadId]
    );

    // Log to audit
    logAudit(db, 'emr_file_processed', 'file_upload', uploadId, {
      filename,
      totalRows: stats.totalRows,
      invoiceCount: stats.invoiceCount,
      serviceLines: stats.serviceLines,
      paymentLines: stats.paymentLines,
      unmappedServicesCount: stats.unmappedServices.size,
      unmappedPaymentTypesCount: stats.unmappedPaymentTypes.size,
      customersMatched: stats.customersMatched,
      newCustomersCreated: stats.newCustomersCreated
    });

    // Save database
    saveDatabase(db, dbPath);

    return {
      success: true,
      uploadId,
      stats: {
        totalRows: stats.totalRows,
        invoiceCount: stats.invoiceCount,
        serviceLines: stats.serviceLines,
        paymentLines: stats.paymentLines,
        unmappedServices: Array.from(stats.unmappedServices),
        unmappedPaymentTypes: Array.from(stats.unmappedPaymentTypes),
        customersMatched: stats.customersMatched,
        newCustomersCreated: stats.newCustomersCreated
      }
    };
  } catch (error: any) {
    console.error('Error processing EMR file:', error);

    // Update file upload status to failed
    try {
      db.run(
        `UPDATE file_uploads SET status = 'failed' WHERE id = ?`,
        [uploadId]
      );
      saveDatabase(db, dbPath);
    } catch (e) {
      // Ignore save errors
    }

    return {
      success: false,
      uploadId,
      stats: { totalRows: 0, invoiceCount: 0, serviceLines: 0, paymentLines: 0, unmappedServices: [], unmappedPaymentTypes: [], customersMatched: 0, newCustomersCreated: 0 },
      error: error.message
    };
  }
}

/**
 * Normalize string for case-insensitive matching (lowercase and trim)
 */
function normalizeKey(str: string | null | undefined): string {
  return (str || '').toLowerCase().trim();
}

/**
 * Load service mappings from database into a Map for quick lookup
 * Keys are normalized for case-insensitive matching
 */
function loadServiceMappings(db: Database): Map<string, ServiceMapping> {
  const map = new Map<string, ServiceMapping>();

  const result = db.exec('SELECT emr_service_name, qb_item_name, income_account, tax_code FROM service_mappings WHERE is_active = 1');

  if (result.length > 0 && result[0].values) {
    for (const row of result[0].values) {
      const mapping: ServiceMapping = {
        emr_service_name: row[0] as string,
        qb_item_name: row[1] as string,
        income_account: row[2] as string,
        tax_code: row[3] as string | null
      };
      // Use normalized key for case-insensitive matching
      map.set(normalizeKey(mapping.emr_service_name), mapping);
    }
  }

  return map;
}

/**
 * Load payment type mappings from database into a Map
 * Keys are normalized for case-insensitive matching
 */
function loadPaymentTypeMappings(db: Database): Map<string, PaymentTypeMapping> {
  const map = new Map<string, PaymentTypeMapping>();

  const result = db.exec('SELECT payment_type, category, clearing_account FROM payment_type_mappings WHERE is_active = 1');

  if (result.length > 0 && result[0].values) {
    for (const row of result[0].values) {
      const mapping: PaymentTypeMapping = {
        payment_type: row[0] as string,
        category: row[1] as string,
        clearing_account: row[2] as string
      };
      // Use normalized key for case-insensitive matching
      map.set(normalizeKey(mapping.payment_type), mapping);
    }
  }

  return map;
}

/**
 * Get staged transactions summary
 */
export function getStagedTransactionsSummary(
  db: Database,
  uploadId?: string
): { invoices: number; services: number; payments: number } {
  let whereClause = '';
  const params: any[] = [];

  if (uploadId) {
    whereClause = 'WHERE upload_id = ?';
    params.push(uploadId);
  }

  // Count distinct invoices
  const invoiceResult = db.exec(
    `SELECT COUNT(DISTINCT invoice_number) FROM transactions_staging ${whereClause}`,
    params
  );
  const invoices = invoiceResult[0]?.values[0]?.[0] as number || 0;

  // Count service lines
  const serviceResult = db.exec(
    `SELECT COUNT(*) FROM transactions_staging ${whereClause} ${whereClause ? 'AND' : 'WHERE'} service_name IS NOT NULL AND service_name != ''`,
    params
  );
  const services = serviceResult[0]?.values[0]?.[0] as number || 0;

  // Count payment lines
  const paymentResult = db.exec(
    `SELECT COUNT(*) FROM transactions_staging ${whereClause} ${whereClause ? 'AND' : 'WHERE'} payment_type IS NOT NULL AND payment_type != ''`,
    params
  );
  const payments = paymentResult[0]?.values[0]?.[0] as number || 0;

  return { invoices, services, payments };
}

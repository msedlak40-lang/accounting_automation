import { Database } from 'sql.js';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { saveDatabase, logAudit } from './database';

interface EMRRow {
  Date: Date;
  'Invoice #': string;
  CID: number;
  customer_id: string;
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
        stats: { totalRows: 0, invoiceCount: 0, serviceLines: 0, paymentLines: 0, unmappedServices: [], unmappedPaymentTypes: [] },
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

    console.log(`Loaded ${serviceMappings.size} service mappings`);
    console.log(`Loaded ${paymentTypeMappings.size} payment type mappings`);

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
      unmappedPaymentTypes: new Set<string>()
    };

    const seenInvoices = new Set<string>();

    for (const row of data) {
      const transactionId = uuidv4();
      const invoiceNumber = String(row['Invoice #'] || '');
      const cid = String(row.CID || '');
      const serviceName = row['Service/Product'] || null;
      const paymentType = row['Payment Type'] || null;
      const txnDate = formatDate(row.Date);

      // Track unique invoices
      if (invoiceNumber && !seenInvoices.has(invoiceNumber)) {
        seenInvoices.add(invoiceNumber);
        stats.invoiceCount++;
      }

      // Determine if this is a service line or payment line
      const isServiceLine = serviceName !== null && serviceName !== '';
      const isPaymentLine = paymentType !== null && paymentType !== '';

      if (isServiceLine) {
        stats.serviceLines++;

        // Check service mapping (using normalized key for case-insensitive matching)
        const serviceMapping = serviceMappings.get(normalizeKey(serviceName));
        if (!serviceMapping) {
          stats.unmappedServices.add(serviceName);
        }
      }

      if (isPaymentLine) {
        stats.paymentLines++;

        // Check payment type mapping (using normalized key for case-insensitive matching)
        const paymentMapping = paymentTypeMappings.get(normalizeKey(paymentType));
        if (!paymentMapping) {
          stats.unmappedPaymentTypes.add(paymentType);
        }
      }

      // Build mapped data JSON (using normalized keys for case-insensitive matching)
      const mappedData: any = {};
      if (serviceName && serviceMappings.has(normalizeKey(serviceName))) {
        const sm = serviceMappings.get(normalizeKey(serviceName))!;
        mappedData.qb_item = sm.qb_item_name;
        mappedData.income_account = sm.income_account;
        mappedData.tax_code = sm.tax_code;
      }
      if (paymentType && paymentTypeMappings.has(normalizeKey(paymentType))) {
        const pm = paymentTypeMappings.get(normalizeKey(paymentType))!;
        mappedData.clearing_account = pm.clearing_account;
        mappedData.category = pm.category;
      }

      // Insert into staging table
      db.run(`
        INSERT INTO transactions_staging (
          id, upload_id, customer_cid, invoice_number, transaction_date,
          service_name, quantity, price, amount, payment_type,
          transaction_data, mapped_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        transactionId,
        uploadId,
        cid,
        invoiceNumber,
        txnDate,
        serviceName,
        row.QTY || null,
        row.Price || null,
        row.Amount || null,
        paymentType,
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
      unmappedPaymentTypesCount: stats.unmappedPaymentTypes.size
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
        unmappedPaymentTypes: Array.from(stats.unmappedPaymentTypes)
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
      stats: { totalRows: 0, invoiceCount: 0, serviceLines: 0, paymentLines: 0, unmappedServices: [], unmappedPaymentTypes: [] },
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
 * Format date to ISO string for SQLite
 */
function formatDate(date: any): string {
  if (!date) return '';

  if (date instanceof Date) {
    return date.toISOString().split('T')[0];
  }

  // Try to parse string date
  const parsed = new Date(date);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return String(date);
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

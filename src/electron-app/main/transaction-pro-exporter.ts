import { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { logAudit, saveDatabase } from './database';

/**
 * Normalize string for case-insensitive matching (lowercase and trim)
 */
function normalizeKey(str: string | null | undefined): string {
  return (str || '').toLowerCase().trim();
}

interface InvoiceLine {
  Customer: string;
  TxnDate: string;
  RefNumber: string;
  Item: string;
  Description: string;
  Quantity: number;
  Rate: number;
  Amount: number;
  TaxCode: string;
  Memo: string;
}

interface PaymentLine {
  Customer: string;
  TxnDate: string;
  RefNumber: string;
  Amount: number;
  PaymentMethod: string;
  DepositToAccount: string;
  ApplyToRefNumber: string;
}

interface ExportResult {
  success: boolean;
  invoicesExported: number;
  paymentsExported: number;
  invoiceFilePath?: string;
  paymentsFilePath?: string;
  error?: string;
  warnings: string[];
}

/**
 * Export staged transactions to Transaction Pro CSV format
 */
export function exportToTransactionPro(
  db: Database,
  dbPath: string,
  outputDir: string,
  uploadId?: string
): ExportResult {
  const warnings: string[] = [];

  try {
    console.log('Starting Transaction Pro export...');
    console.log('Output directory:', outputDir);

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Get service mappings
    const serviceMappings = getServiceMappings(db);
    // Get payment type mappings
    const paymentMappings = getPaymentTypeMappings(db);
    // Get customer mappings by UUID (primary) and by CID (fallback)
    const customerMappings = getCustomerMappings(db);
    const customerMappingsByCID = getCustomerMappingsByCID(db);

    // Get staged transactions
    let whereClause = '';
    if (uploadId) {
      whereClause = `WHERE upload_id = '${uploadId}'`;
    }

    const txnResult = db.exec(`
      SELECT * FROM transactions_staging
      ${whereClause}
      ORDER BY transaction_date, invoice_number
    `);

    if (txnResult.length === 0 || txnResult[0].values.length === 0) {
      return {
        success: false,
        invoicesExported: 0,
        paymentsExported: 0,
        error: 'No transactions found to export',
        warnings
      };
    }

    const transactions = txnResult[0].values.map((row: any[]) => {
      const obj: any = {};
      txnResult[0].columns.forEach((col: string, i: number) => {
        obj[col] = row[i];
      });
      return obj;
    });

    console.log(`Found ${transactions.length} transactions to process`);

    // Build invoice lines (service items)
    const invoiceLines: InvoiceLine[] = [];
    const paymentLines: PaymentLine[] = [];

    const processedInvoices = new Set<string>();

    for (const txn of transactions) {
      const cid = String(txn.customer_cid || '');
      const customerId = txn.customer_id || null; // UUID from transactions_staging
      const invoiceNumber = txn.invoice_number || '';
      const txnDate = txn.transaction_date || '';
      const serviceName = txn.service_name || '';
      const paymentType = txn.payment_type || '';

      // Get customer name for QB
      // Priority: 1) UUID lookup qb_name, 2) CID lookup qb_name, 3) EMR name, 4) CID
      let customerName = cid; // Default to CID
      let foundCustomer = false;

      // Try UUID lookup first
      if (customerId && customerMappings.has(customerId)) {
        const custInfo = customerMappings.get(customerId)!;
        if (custInfo.qb_name) {
          customerName = custInfo.qb_name;
          foundCustomer = true;
        } else if (custInfo.emr_name) {
          customerName = custInfo.emr_name;
          foundCustomer = true;
        }
      }

      // Fall back to CID lookup
      if (!foundCustomer && cid && customerMappingsByCID.has(cid)) {
        const custInfo = customerMappingsByCID.get(cid)!;
        if (custInfo.qb_name) {
          customerName = custInfo.qb_name;
          foundCustomer = true;
        } else if (custInfo.emr_name) {
          customerName = custInfo.emr_name;
          foundCustomer = true;
        }
      }

      if (!foundCustomer && cid) {
        warnings.push(`Customer CID ${cid} not found in crosswalk - using CID as customer name`);
      }

      // Process service lines (using normalized key for case-insensitive matching)
      if (serviceName) {
        const serviceMapping = serviceMappings.get(normalizeKey(serviceName));

        if (!serviceMapping) {
          warnings.push(`Service "${serviceName}" not mapped - skipping`);
          continue;
        }

        invoiceLines.push({
          Customer: customerName,
          TxnDate: formatDateForQB(txnDate),
          RefNumber: invoiceNumber,
          Item: serviceMapping.qb_item_name,
          Description: serviceName,
          Quantity: txn.quantity || 1,
          Rate: txn.price || 0,
          Amount: (txn.quantity || 1) * (txn.price || 0),
          TaxCode: serviceMapping.tax_code || 'Non',
          Memo: ''
        });

        processedInvoices.add(invoiceNumber);
      }

      // Process payment lines (using normalized key for case-insensitive matching)
      if (paymentType && txn.amount > 0) {
        const paymentMapping = paymentMappings.get(normalizeKey(paymentType));

        if (!paymentMapping) {
          warnings.push(`Payment type "${paymentType}" not mapped - using default clearing account`);
        }

        const clearingAccount = paymentMapping?.clearing_account || '1030 Merchant Clearing';

        paymentLines.push({
          Customer: customerName,
          TxnDate: formatDateForQB(txnDate),
          RefNumber: `PMT-${invoiceNumber}`,
          Amount: txn.amount,
          PaymentMethod: paymentType,
          DepositToAccount: clearingAccount,
          ApplyToRefNumber: invoiceNumber
        });
      }
    }

    // Generate timestamp for filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    // Write Invoice CSV
    const invoiceFilePath = path.join(outputDir, `invoices_${timestamp}.csv`);
    if (invoiceLines.length > 0) {
      const invoiceCsv = generateCSV(invoiceLines, [
        'Customer', 'TxnDate', 'RefNumber', 'Item', 'Description',
        'Quantity', 'Rate', 'Amount', 'TaxCode', 'Memo'
      ]);
      fs.writeFileSync(invoiceFilePath, invoiceCsv);
      console.log(`Wrote ${invoiceLines.length} invoice lines to ${invoiceFilePath}`);
    }

    // Write Payments CSV
    const paymentsFilePath = path.join(outputDir, `payments_${timestamp}.csv`);
    if (paymentLines.length > 0) {
      const paymentsCsv = generateCSV(paymentLines, [
        'Customer', 'TxnDate', 'RefNumber', 'Amount', 'PaymentMethod',
        'DepositToAccount', 'ApplyToRefNumber'
      ]);
      fs.writeFileSync(paymentsFilePath, paymentsCsv);
      console.log(`Wrote ${paymentLines.length} payment lines to ${paymentsFilePath}`);
    }

    // Log the export
    logAudit(db, 'transaction_pro_export', 'export', null, {
      invoicesExported: invoiceLines.length,
      paymentsExported: paymentLines.length,
      invoiceFilePath,
      paymentsFilePath,
      warningsCount: warnings.length
    });

    saveDatabase(db, dbPath);

    return {
      success: true,
      invoicesExported: invoiceLines.length,
      paymentsExported: paymentLines.length,
      invoiceFilePath: invoiceLines.length > 0 ? invoiceFilePath : undefined,
      paymentsFilePath: paymentLines.length > 0 ? paymentsFilePath : undefined,
      warnings
    };
  } catch (error: any) {
    console.error('Export error:', error);
    return {
      success: false,
      invoicesExported: 0,
      paymentsExported: 0,
      error: error.message,
      warnings
    };
  }
}

/**
 * Get service mappings from database
 * Keys are normalized for case-insensitive matching
 */
function getServiceMappings(db: Database): Map<string, { qb_item_name: string; income_account: string; tax_code: string | null }> {
  const map = new Map();

  const result = db.exec(`
    SELECT emr_service_name, qb_item_name, income_account, tax_code
    FROM service_mappings
    WHERE is_active = 1
  `);

  if (result.length > 0 && result[0].values) {
    for (const row of result[0].values) {
      // Use normalized key for case-insensitive matching
      map.set(normalizeKey(row[0] as string), {
        qb_item_name: row[1] as string,
        income_account: row[2] as string,
        tax_code: row[3] as string | null
      });
    }
  }

  return map;
}

/**
 * Get payment type mappings from database
 * Keys are normalized for case-insensitive matching
 */
function getPaymentTypeMappings(db: Database): Map<string, { category: string; clearing_account: string }> {
  const map = new Map();

  const result = db.exec(`
    SELECT payment_type, category, clearing_account
    FROM payment_type_mappings
    WHERE is_active = 1
  `);

  if (result.length > 0 && result[0].values) {
    for (const row of result[0].values) {
      // Use normalized key for case-insensitive matching
      map.set(normalizeKey(row[0] as string), {
        category: row[1] as string,
        clearing_account: row[2] as string
      });
    }
  }

  return map;
}

/**
 * Get customer mappings from database
 * Maps customer_id (UUID) directly to qb_display_name via stg_qb_customers
 */
function getCustomerMappings(db: Database): Map<string, { emr_name: string | null; qb_name: string | null }> {
  const map = new Map();

  // Primary path: customer_id → stg_qb_customers.customer_id → qb_display_name
  // This is the direct UUID-based lookup
  const result = db.exec(`
    SELECT
      c.customer_id,
      ep.full_name as emr_name,
      qbc.qb_display_name as qb_name
    FROM customers c
    LEFT JOIN customer_ids emr_ci ON c.customer_id = emr_ci.customer_id
      AND (emr_ci.system_name = 'EMR' OR emr_ci.system_name LIKE '%EMR%')
    LEFT JOIN stg_emr_patients ep ON emr_ci.external_id = ep.emr_patient_id
    LEFT JOIN stg_qb_customers qbc ON qbc.customer_id = c.customer_id
    WHERE c.status = 'active'
  `);

  if (result.length > 0 && result[0].values) {
    for (const row of result[0].values) {
      map.set(row[0] as string, {
        emr_name: row[1] as string | null,
        qb_name: row[2] as string | null
      });
    }
  }

  // Secondary path: also check via customer_ids QB mapping for customers not in stg_qb_customers directly
  const secondaryResult = db.exec(`
    SELECT
      c.customer_id,
      qbc.qb_display_name as qb_name
    FROM customers c
    JOIN customer_ids qb_ci ON c.customer_id = qb_ci.customer_id
      AND (qb_ci.system_name = 'QuickBooks' OR qb_ci.system_name = 'QB' OR qb_ci.system_name LIKE '%QB%')
    JOIN stg_qb_customers qbc ON qb_ci.external_id = qbc.qb_listid
    WHERE c.status = 'active'
  `);

  if (secondaryResult.length > 0 && secondaryResult[0].values) {
    for (const row of secondaryResult[0].values) {
      const customerId = row[0] as string;
      const qbName = row[1] as string | null;
      // Only add if not already mapped or if existing entry has no qb_name
      if (!map.has(customerId)) {
        map.set(customerId, { emr_name: null, qb_name: qbName });
      } else if (qbName && !map.get(customerId)!.qb_name) {
        const existing = map.get(customerId)!;
        map.set(customerId, { ...existing, qb_name: qbName });
      }
    }
  }

  return map;
}

/**
 * Get customer mappings by EMR CID (for backward compatibility)
 * Maps EMR patient ID (CID) to qb_display_name via customer_id
 */
function getCustomerMappingsByCID(db: Database): Map<string, { emr_name: string | null; qb_name: string | null; customer_id: string | null }> {
  const map = new Map();

  // Map EMR CID → customer_id → stg_qb_customers.qb_display_name
  const result = db.exec(`
    SELECT
      ci.external_id as emr_cid,
      ep.full_name as emr_name,
      qbc.qb_display_name as qb_name,
      c.customer_id
    FROM customer_ids ci
    JOIN customers c ON ci.customer_id = c.customer_id
    LEFT JOIN stg_emr_patients ep ON ci.external_id = ep.emr_patient_id
    LEFT JOIN stg_qb_customers qbc ON qbc.customer_id = c.customer_id
    WHERE (ci.system_name = 'EMR' OR ci.system_name LIKE '%EMR%') AND c.status = 'active'
  `);

  if (result.length > 0 && result[0].values) {
    for (const row of result[0].values) {
      map.set(String(row[0]), {
        emr_name: row[1] as string | null,
        qb_name: row[2] as string | null,
        customer_id: row[3] as string | null
      });
    }
  }

  return map;
}

/**
 * Format date for QuickBooks (MM/DD/YYYY)
 */
function formatDateForQB(dateStr: string): string {
  if (!dateStr) return '';

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();

    return `${month}/${day}/${year}`;
  } catch {
    return dateStr;
  }
}

/**
 * Generate CSV string from array of objects
 */
function generateCSV(data: any[], columns: string[]): string {
  const lines: string[] = [];

  // Header
  lines.push(columns.join(','));

  // Data rows
  for (const row of data) {
    const values = columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      if (typeof val === 'string') {
        // Escape quotes and wrap in quotes if contains comma or quote
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }
      return String(val);
    });
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

/**
 * Get export preview (counts without generating files)
 */
export function getExportPreview(
  db: Database,
  uploadId?: string
): { invoiceLines: number; paymentLines: number; unmappedServices: string[]; unmappedPayments: string[] } {
  const serviceMappings = getServiceMappings(db);
  const paymentMappings = getPaymentTypeMappings(db);

  let whereClause = '';
  if (uploadId) {
    whereClause = `WHERE upload_id = '${uploadId}'`;
  }

  // Count service lines
  const serviceResult = db.exec(`
    SELECT COUNT(*) as cnt FROM transactions_staging
    ${whereClause}
    ${whereClause ? 'AND' : 'WHERE'} service_name IS NOT NULL AND service_name != ''
  `);
  const invoiceLines = serviceResult[0]?.values[0]?.[0] as number || 0;

  // Count payment lines
  const paymentResult = db.exec(`
    SELECT COUNT(*) as cnt FROM transactions_staging
    ${whereClause}
    ${whereClause ? 'AND' : 'WHERE'} payment_type IS NOT NULL AND payment_type != '' AND amount > 0
  `);
  const paymentLines = paymentResult[0]?.values[0]?.[0] as number || 0;

  // Get unmapped services (using normalized key for case-insensitive matching)
  const unmappedServiceResult = db.exec(`
    SELECT DISTINCT service_name FROM transactions_staging
    ${whereClause}
    ${whereClause ? 'AND' : 'WHERE'} service_name IS NOT NULL AND service_name != ''
  `);
  const unmappedServices: string[] = [];
  if (unmappedServiceResult.length > 0) {
    for (const row of unmappedServiceResult[0].values) {
      const serviceName = row[0] as string;
      if (!serviceMappings.has(normalizeKey(serviceName))) {
        unmappedServices.push(serviceName);
      }
    }
  }

  // Get unmapped payment types (using normalized key for case-insensitive matching)
  const unmappedPaymentResult = db.exec(`
    SELECT DISTINCT payment_type FROM transactions_staging
    ${whereClause}
    ${whereClause ? 'AND' : 'WHERE'} payment_type IS NOT NULL AND payment_type != ''
  `);
  const unmappedPayments: string[] = [];
  if (unmappedPaymentResult.length > 0) {
    for (const row of unmappedPaymentResult[0].values) {
      const paymentType = row[0] as string;
      if (!paymentMappings.has(normalizeKey(paymentType))) {
        unmappedPayments.push(paymentType);
      }
    }
  }

  return { invoiceLines, paymentLines, unmappedServices, unmappedPayments };
}

import type { Database } from 'sql.js';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logAudit, saveDatabase } from './database';

interface GravityRow {
  'Date/Time'?: string;
  'Approval'?: string;
  'Type'?: string;
  'Card'?: string;
  'Sale Amount'?: number | string;
  'Tip'?: number | string;
  'Total'?: number | string;
  'Cashier'?: string;
  'Source'?: string;
  'Card Type'?: string;
  [key: string]: any;
}

interface ProcessResult {
  success: boolean;
  uploadId: string;
  stats: {
    totalRows: number;
    paymentCount: number;
    totalAmount: number;
  };
  error?: string;
}

interface MatchResult {
  success: boolean;
  matchCount: number;
  unmatchedCount: number;
  matches: PaymentMatch[];
  error?: string;
}

interface PaymentMatch {
  gravityPaymentId: string;
  transactionId: string;
  invoiceNumber: string;
  customerId: string;
  amount: number;
  confidence: 'exact' | 'fuzzy';
}

/**
 * Parse date from Gravity format (MM/DD/YYYY HH:MM)
 */
function parseGravityDate(dateStr: string | null): string | null {
  if (!dateStr) return null;

  const str = String(dateStr).trim();

  // Match formats like "10/8/2025 20:27" or "10/08/2025 20:27"
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (match) {
    const [, month, day, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try parsing as regular date
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Parse amount from string/number
 */
function parseAmount(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;

  const cleaned = String(value).replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Extract last 4 digits from card number (format: ****6599)
 */
function extractCardLastFour(cardStr: string | null): string | null {
  if (!cardStr) return null;
  const match = String(cardStr).match(/\*+(\d{4})/);
  return match ? match[1] : null;
}

/**
 * Process a Gravity payments file
 */
export function processGravityFile(
  db: Database,
  dbPath: string,
  filePath: string
): ProcessResult {
  try {
    // Read the file (CSV or Excel)
    let rows: GravityRow[] = [];

    if (filePath.toLowerCase().endsWith('.csv')) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row: GravityRow = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx];
        });
        rows.push(row);
      }
    } else {
      // Excel file
      const buffer = fs.readFileSync(filePath);
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(worksheet);
    }

    if (rows.length === 0) {
      return {
        success: false,
        uploadId: '',
        stats: { totalRows: 0, paymentCount: 0, totalAmount: 0 },
        error: 'No data found in file',
      };
    }

    // Create upload record
    const uploadId = uuidv4();
    const filename = filePath.split(/[/\\]/).pop() || 'unknown';

    db.run(`
      INSERT INTO file_uploads (id, filename, file_type, status, row_count)
      VALUES (?, ?, 'gravity_payments', 'processing', ?)
    `, [uploadId, filename, rows.length]);

    let paymentCount = 0;
    let totalAmount = 0;

    // Process each payment
    for (const row of rows) {
      const transactionDate = parseGravityDate(row['Date/Time']);
      const approvalCode = row['Approval'];
      const transactionType = row['Type'];
      const cardLastFour = extractCardLastFour(row['Card']);
      const saleAmount = parseAmount(row['Sale Amount']);
      const tipAmount = parseAmount(row['Tip']);
      const totalAmountValue = parseAmount(row['Total']);
      const cashier = row['Cashier'];
      const source = row['Source'];
      const cardType = row['Card Type'];

      // Skip if no valid amount
      if (!totalAmountValue || totalAmountValue === 0) continue;

      // Insert Gravity payment
      const paymentId = uuidv4();
      db.run(`
        INSERT INTO gravity_payments (
          id, upload_id, transaction_date, approval_code, transaction_type,
          card_last_four, sale_amount, tip_amount, total_amount, cashier,
          source, card_type, transaction_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        paymentId,
        uploadId,
        transactionDate,
        approvalCode,
        transactionType,
        cardLastFour,
        saleAmount,
        tipAmount,
        totalAmountValue,
        cashier,
        source,
        cardType,
        JSON.stringify(row),
      ]);

      paymentCount++;
      totalAmount += totalAmountValue;
    }

    // Update upload status
    db.run(`
      UPDATE file_uploads
      SET status = 'processed', processed_at = datetime('now')
      WHERE id = ?
    `, [uploadId]);

    logAudit(db, 'gravity_payments_processed', 'file_upload', uploadId, {
      filename,
      totalRows: rows.length,
      paymentCount,
      totalAmount,
    });

    saveDatabase(db, dbPath);

    return {
      success: true,
      uploadId,
      stats: {
        totalRows: rows.length,
        paymentCount,
        totalAmount,
      },
    };
  } catch (error: any) {
    console.error('Error processing Gravity file:', error);
    return {
      success: false,
      uploadId: '',
      stats: { totalRows: 0, paymentCount: 0, totalAmount: 0 },
      error: error.message,
    };
  }
}

/**
 * Match Gravity payments to EMR invoices
 * Matching logic: Exact amount match + date within ±3 days
 */
export function matchGravityPayments(
  db: Database,
  dbPath: string,
  uploadId?: string
): MatchResult {
  try {
    // Build WHERE clause for uploadId filter
    let whereClause = '';
    if (uploadId) {
      whereClause = `WHERE gp.upload_id = '${uploadId}'`;
    }

    // Get all unmatched Gravity payments
    const gravityPayments = db.exec(`
      SELECT
        gp.id,
        gp.transaction_date,
        gp.total_amount,
        gp.approval_code,
        gp.card_type
      FROM gravity_payments gp
      LEFT JOIN payment_matches pm ON pm.gravity_payment_id = gp.id
      ${whereClause}
      ${whereClause ? 'AND' : 'WHERE'} pm.id IS NULL
      ORDER BY gp.transaction_date DESC
    `);

    if (!gravityPayments.length || !gravityPayments[0].values.length) {
      return {
        success: true,
        matchCount: 0,
        unmatchedCount: 0,
        matches: [],
      };
    }

    const matches: PaymentMatch[] = [];
    let unmatchedCount = 0;

    // For each Gravity payment, find matching EMR transactions
    for (const gpRow of gravityPayments[0].values) {
      const [gpId, gpDate, gpAmount, gpApproval, gpCardType] = gpRow;

      // Calculate date range (±3 days)
      const date = new Date(gpDate as string);
      const minDate = new Date(date);
      minDate.setDate(minDate.getDate() - 3);
      const maxDate = new Date(date);
      maxDate.setDate(maxDate.getDate() + 3);

      const minDateStr = minDate.toISOString().split('T')[0];
      const maxDateStr = maxDate.toISOString().split('T')[0];

      // Find matching EMR transactions (by amount and date range)
      const matchingTransactions = db.exec(`
        SELECT
          ts.id,
          ts.invoice_number,
          ts.customer_id,
          ts.transaction_date,
          ts.amount,
          ts.payment_type
        FROM transactions_staging ts
        WHERE ABS(ts.amount - ?) < 0.01
          AND ts.transaction_date BETWEEN ? AND ?
          AND ts.amount > 0
        ORDER BY ts.transaction_date
        LIMIT 5
      `, [gpAmount, minDateStr, maxDateStr]);

      if (matchingTransactions.length > 0 && matchingTransactions[0].values.length > 0) {
        // Found match(es)
        const matchCount = matchingTransactions[0].values.length;
        const confidence = matchCount === 1 ? 'exact' : 'fuzzy';

        // Take the first match (closest date)
        const [tsId, invoiceNumber, customerId, tsDate, tsAmount, paymentType] = matchingTransactions[0].values[0];

        const matchId = uuidv4();

        // Insert match record
        db.run(`
          INSERT INTO payment_matches (
            id, gravity_payment_id, transaction_id, invoice_number,
            customer_id, match_confidence, amount, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
        `, [matchId, gpId, tsId, invoiceNumber, customerId, confidence, gpAmount]);

        matches.push({
          gravityPaymentId: gpId as string,
          transactionId: tsId as string,
          invoiceNumber: invoiceNumber as string,
          customerId: customerId as string,
          amount: gpAmount as number,
          confidence,
        });
      } else {
        unmatchedCount++;
      }
    }

    logAudit(db, 'gravity_payments_matched', 'payment_matches', null, {
      matchCount: matches.length,
      unmatchedCount,
    });

    saveDatabase(db, dbPath);

    return {
      success: true,
      matchCount: matches.length,
      unmatchedCount,
      matches,
    };
  } catch (error: any) {
    console.error('Error matching Gravity payments:', error);
    return {
      success: false,
      matchCount: 0,
      unmatchedCount: 0,
      matches: [],
      error: error.message,
    };
  }
}

/**
 * Get Gravity payment summary
 */
export function getGravitySummary(db: Database, uploadId?: string): {
  totalPayments: number;
  totalAmount: number;
  matchedCount: number;
  unmatchedCount: number;
} {
  let whereClause = '';
  const params: any[] = [];

  if (uploadId) {
    whereClause = 'WHERE gp.upload_id = ?';
    params.push(uploadId);
  }

  const result = db.exec(`
    SELECT
      COUNT(gp.id) as total_payments,
      SUM(gp.total_amount) as total_amount,
      SUM(CASE WHEN pm.id IS NOT NULL THEN 1 ELSE 0 END) as matched_count,
      SUM(CASE WHEN pm.id IS NULL THEN 1 ELSE 0 END) as unmatched_count
    FROM gravity_payments gp
    LEFT JOIN payment_matches pm ON pm.gravity_payment_id = gp.id
    ${whereClause}
  `, params);

  if (result.length > 0 && result[0].values.length > 0) {
    const [totalPayments, totalAmount, matchedCount, unmatchedCount] = result[0].values[0];
    return {
      totalPayments: totalPayments as number || 0,
      totalAmount: totalAmount as number || 0,
      matchedCount: matchedCount as number || 0,
      unmatchedCount: unmatchedCount as number || 0,
    };
  }

  return { totalPayments: 0, totalAmount: 0, matchedCount: 0, unmatchedCount: 0 };
}

/**
 * Get payment matches with details
 */
export function getPaymentMatches(db: Database, uploadId?: string): any[] {
  let whereClause = '';
  if (uploadId) {
    whereClause = `WHERE gp.upload_id = '${uploadId}'`;
  }

  const result = db.exec(`
    SELECT
      pm.id,
      pm.gravity_payment_id,
      pm.transaction_id,
      pm.invoice_number,
      pm.customer_id,
      pm.match_confidence,
      pm.amount,
      pm.status,
      gp.transaction_date as gravity_date,
      gp.approval_code,
      gp.card_type,
      ts.transaction_date as emr_date,
      ts.customer_cid,
      COALESCE(qb.qb_display_name, ep.full_name) as customer_name
    FROM payment_matches pm
    INNER JOIN gravity_payments gp ON gp.id = pm.gravity_payment_id
    INNER JOIN transactions_staging ts ON ts.id = pm.transaction_id
    LEFT JOIN stg_qb_customers qb ON qb.customer_id = pm.customer_id
    LEFT JOIN customer_ids ci ON ci.customer_id = pm.customer_id AND ci.system_name = 'EMR'
    LEFT JOIN stg_emr_patients ep ON ep.emr_patient_id = ci.external_id
    ${whereClause}
    ORDER BY pm.matched_at DESC
  `);

  if (result.length > 0 && result[0].values.length > 0) {
    return result[0].values.map((row: any[]) => {
      const obj: any = {};
      result[0].columns.forEach((col: string, i: number) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  return [];
}

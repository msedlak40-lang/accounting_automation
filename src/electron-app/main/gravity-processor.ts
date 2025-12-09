import { Database } from 'sql.js';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { saveDatabase, logAudit } from './database';
import { parseDateTime } from './date-utils';

interface GravityPaymentRow {
  'Date/Time': string;
  'Approval': string;
  'Type': string;
  'Card': string;
  'Sale Amount': number | string;
  'Tip': number | string;
  'Total': number | string;
  'Cashier': string;
  'Source': string;
  'Card Type': string;
}

interface ProcessingResult {
  success: boolean;
  uploadId: string;
  stats: {
    totalRows: number;
    paymentsImported: number;
    totalAmount: number;
  };
  error?: string;
}

interface MatchResult {
  success: boolean;
  matchCount: number;
  error?: string;
}

interface GravityPayment {
  id: string;
  transaction_datetime: string;
  approval_code: string;
  transaction_type: string;
  card_last_four: string;
  sale_amount: number;
  tip_amount: number;
  total_amount: number;
  cashier: string | null;
  source: string;
  card_type: string;
  match_status: string;
}

interface PaymentMatch {
  id: string;
  payment_id: string;
  gravity_payment_id: string;
  invoice_number: string;
  customer_id: string | null;
  match_confidence: string;
  match_score: number;
  match_status: string;
  status: string;
  match_reason: string;
  payment?: GravityPayment;
  emr_customer_name?: string | null;
  emr_customer_cid?: string | null;
  emr_payment_amount?: number | null;
  emr_transaction_date?: string | null;
  // UI-friendly aliases
  customer_name?: string | null;
  customer_cid?: string | null;
  amount?: number | null;
  card_type?: string | null;
  gravity_date?: string | null;
  transaction_date?: string | null;
}

interface EMRPayment {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  transaction_date: string;
  payment_amount: number;
  payment_type: string;
}

/**
 * Process a Gravity payments CSV file
 */
export function processGravityFile(
  db: Database,
  dbPath: string,
  filePath: string
): ProcessingResult {
  const uploadId = uuidv4();

  try {
    console.log(`Processing Gravity file: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        uploadId,
        stats: { totalRows: 0, paymentsImported: 0, totalAmount: 0 },
        error: `File not found: ${filePath}`
      };
    }

    // Read the CSV file
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<GravityPaymentRow>(sheet);

    console.log(`Found ${data.length} rows in Gravity file`);

    // Create file upload record
    const filename = filePath.split(/[/\\]/).pop() || 'unknown.csv';
    db.run(
      `INSERT INTO file_uploads (id, filename, file_type, row_count, status) VALUES (?, ?, ?, ?, 'processing')`,
      [uploadId, filename, 'gravity_payments', data.length]
    );

    let paymentsImported = 0;
    let totalAmount = 0;

    for (const row of data) {
      const paymentId = uuidv4();

      // Parse datetime - handles both string format ("10/8/2025 20:27") and Excel serial numbers
      const datetime = parseDateTime(row['Date/Time']);

      // Parse amounts
      const saleAmount = parseFloat(String(row['Sale Amount'] || 0));
      const tipAmount = parseFloat(String(row['Tip'] || 0));
      const totalAmt = parseFloat(String(row['Total'] || 0));

      // Extract card last 4 digits from "****6599" format
      const cardLastFour = row['Card'] ? String(row['Card']).replace(/\*/g, '') : null;

      db.run(`
        INSERT INTO stg_gravity_payments (
          id, upload_id, transaction_datetime, approval_code, transaction_type,
          card_last_four, sale_amount, tip_amount, total_amount,
          cashier, source, card_type, match_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unmatched')
      `, [
        paymentId,
        uploadId,
        datetime,
        row['Approval'] || null,
        row['Type'] || null,
        cardLastFour,
        saleAmount,
        tipAmount,
        totalAmt,
        row['Cashier'] || null,
        row['Source'] || null,
        row['Card Type'] || null
      ]);

      paymentsImported++;
      totalAmount += totalAmt;
    }

    // Update file upload status
    db.run(
      `UPDATE file_uploads SET status = 'processed', processed_at = datetime('now') WHERE id = ?`,
      [uploadId]
    );

    logAudit(db, 'gravity_file_processed', 'file_upload', uploadId, {
      filename,
      totalRows: data.length,
      paymentsImported,
      totalAmount
    });

    saveDatabase(db, dbPath);

    return {
      success: true,
      uploadId,
      stats: {
        totalRows: data.length,
        paymentsImported,
        totalAmount
      }
    };
  } catch (error: any) {
    console.error('Error processing Gravity file:', error);

    try {
      db.run(`UPDATE file_uploads SET status = 'failed' WHERE id = ?`, [uploadId]);
      saveDatabase(db, dbPath);
    } catch (e) {
      // Ignore save errors
    }

    return {
      success: false,
      uploadId,
      stats: { totalRows: 0, paymentsImported: 0, totalAmount: 0 },
      error: error.message
    };
  }
}

/**
 * Get EMR payments to match against Gravity payments - OPTIMIZED VERSION
 * Uses SQL to efficiently find potential matches instead of loading everything
 */
function findEMRPaymentCandidates(
  db: Database,
  paymentDate: string,
  paymentAmount: number,
  dateToleranceDays: number = 7,
  amountTolerancePercent: number = 2
): EMRPayment[] {
  // Calculate date range
  const dateParts = paymentDate.split('T')[0];
  const dateObj = new Date(dateParts);
  const startDate = new Date(dateObj);
  startDate.setDate(startDate.getDate() - dateToleranceDays);
  const endDate = new Date(dateObj);
  endDate.setDate(endDate.getDate() + dateToleranceDays);

  // Calculate amount range (within tolerance)
  const amountTolerance = paymentAmount * (amountTolerancePercent / 100);
  const minAmount = paymentAmount - Math.max(amountTolerance, 1.00);
  const maxAmount = paymentAmount + Math.max(amountTolerance, 1.00);

  // Use SQL with indexes to efficiently filter candidates
  const result = db.exec(`
    SELECT
      id,
      invoice_number,
      customer_id,
      customer_name,
      transaction_date,
      payment_amount,
      payment_type
    FROM stg_emr_payments
    WHERE match_status = 'unmatched'
      AND payment_amount BETWEEN ? AND ?
      AND DATE(transaction_date) BETWEEN DATE(?) AND DATE(?)
    ORDER BY ABS(payment_amount - ?) ASC,
             ABS(JULIANDAY(transaction_date) - JULIANDAY(?)) ASC
    LIMIT 10
  `, [
    minAmount,
    maxAmount,
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0],
    paymentAmount,
    paymentDate
  ]);

  if (result.length === 0) return [];

  const payments: EMRPayment[] = [];
  for (const row of result[0].values) {
    payments.push({
      id: row[0] as string,
      invoice_number: row[1] as string,
      customer_id: row[2] as string,
      customer_name: row[3] as string,
      transaction_date: row[4] as string,
      payment_amount: row[5] as number,
      payment_type: row[6] as string
    });
  }

  return payments;
}

/**
 * Match Gravity payments to EMR payments using intelligent matching - OPTIMIZED
 */
export function matchGravityPayments(
  db: Database,
  dbPath: string
): MatchResult {
  try {
    console.log('Starting Gravity payment matching (OPTIMIZED)...');

    // Get all unmatched payments
    const paymentsResult = db.exec(`
      SELECT id, transaction_datetime, total_amount, approval_code, card_last_four
      FROM stg_gravity_payments
      WHERE match_status = 'unmatched'
      ORDER BY transaction_datetime DESC
    `);

    if (paymentsResult.length === 0 || paymentsResult[0].values.length === 0) {
      console.log('No unmatched Gravity payments found');
      return { success: true, matchCount: 0 };
    }

    const payments = paymentsResult[0].values;
    const totalPayments = payments.length;

    // Get EMR payment count for logging
    const emrCountResult = db.exec(`
      SELECT COUNT(*) FROM stg_emr_payments WHERE match_status = 'unmatched'
    `);
    const emrCount = emrCountResult[0]?.values[0]?.[0] || 0;

    console.log(`Matching ${totalPayments} Gravity payments against ${emrCount} EMR payments using SQL-based matching`);

    let matchCount = 0;
    let processedCount = 0;
    const batchSize = 50; // Save database every 50 payments

    // Begin transaction for better performance
    db.run('BEGIN TRANSACTION');

    for (const payment of payments) {
      const paymentId = payment[0] as string;
      const paymentDatetime = payment[1] as string;
      const paymentAmount = payment[2] as number;

      processedCount++;

      // Progress reporting every 10 payments
      if (processedCount % 10 === 0 || processedCount === totalPayments) {
        console.log(`Progress: ${processedCount}/${totalPayments} (${Math.round(processedCount/totalPayments*100)}%)`);
      }

      // Extract date from datetime for date-based matching
      const paymentDate = paymentDatetime.split('T')[0];

      // Find potential matches using SQL (much faster!)
      const emrCandidates = findEMRPaymentCandidates(
        db,
        paymentDate,
        paymentAmount
      );

      // Evaluate candidates using the existing scoring logic
      const matches = findMatchingEMRPayments(
        paymentDate,
        paymentAmount,
        emrCandidates
      );

      // Create match records for top candidates
      for (const match of matches) {
        const matchId = uuidv4();

        db.run(`
          INSERT INTO gravity_payment_matches (
            id, payment_id, emr_payment_id, invoice_number, customer_id, customer_name,
            match_confidence, match_score, match_status, match_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          matchId,
          paymentId,
          match.emr_payment_id,
          match.invoice_number,
          match.customer_id,
          match.customer_name,
          match.confidence,
          match.score,
          match.confidence === 'high' ? 'auto_approved' : 'pending',
          match.reason
        ]);

        matchCount++;

        // Update payment match status if high confidence
        if (match.confidence === 'high') {
          db.run(`
            UPDATE stg_gravity_payments
            SET match_status = 'matched'
            WHERE id = ?
          `, [paymentId]);

          db.run(`
            UPDATE stg_emr_payments
            SET match_status = 'matched', matched_payment_id = ?
            WHERE id = ?
          `, [paymentId, match.emr_payment_id]);
        }
      }

      // Commit and save periodically to avoid long-running transactions
      if (processedCount % batchSize === 0 && processedCount < totalPayments) {
        db.run('COMMIT');
        saveDatabase(db, dbPath);
        db.run('BEGIN TRANSACTION');
        console.log(`Saved progress at ${processedCount} payments`);
      }
    }

    // Final commit
    db.run('COMMIT');

    logAudit(db, 'gravity_payments_matched', 'gravity_matches', undefined, {
      matchCount,
      paymentsProcessed: payments.length
    });

    saveDatabase(db, dbPath);

    console.log(`✓ Matching complete! Created ${matchCount} matches from ${totalPayments} payments`);
    return { success: true, matchCount };
  } catch (error: any) {
    console.error('Error matching Gravity payments:', error);
    // Rollback on error
    try {
      db.run('ROLLBACK');
    } catch (e) {
      // Ignore rollback errors
    }
    return { success: false, matchCount: 0, error: error.message };
  }
}

/**
 * Find matching EMR payments for a Gravity payment
 */
function findMatchingEMRPayments(
  paymentDate: string,
  paymentAmount: number,
  emrPayments: EMRPayment[]
): Array<{
  emr_payment_id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  confidence: string;
  score: number;
  reason: string
}> {
  const matches: Array<{
    emr_payment_id: string;
    invoice_number: string;
    customer_id: string;
    customer_name: string;
    confidence: string;
    score: number;
    reason: string
  }> = [];

  for (const emrPayment of emrPayments) {
    const emrDate = emrPayment.transaction_date.split('T')[0];
    const emrAmount = emrPayment.payment_amount;

    let score = 0;
    const reasons: string[] = [];

    // Exact amount match (highest weight)
    if (Math.abs(emrAmount - paymentAmount) < 0.01) {
      score += 50;
      reasons.push('exact amount match');
    } else if (Math.abs(emrAmount - paymentAmount) < 1.00) {
      // Within $1 tolerance
      score += 30;
      reasons.push('amount within $1');
    } else if (Math.abs(emrAmount - paymentAmount) / emrAmount < 0.02) {
      // Within 2% tolerance
      score += 20;
      reasons.push('amount within 2%');
    } else {
      // Amount too different, skip this payment
      continue;
    }

    // Date proximity (same day = best)
    const daysDiff = Math.abs(
      (new Date(paymentDate).getTime() - new Date(emrDate).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDiff === 0) {
      score += 30;
      reasons.push('same day');
    } else if (daysDiff <= 1) {
      score += 20;
      reasons.push('within 1 day');
    } else if (daysDiff <= 3) {
      score += 10;
      reasons.push('within 3 days');
    } else if (daysDiff <= 7) {
      score += 5;
      reasons.push('within 1 week');
    } else {
      // More than a week apart, less likely
      score -= 10;
      reasons.push(`${Math.round(daysDiff)} days apart`);
    }

    // Determine confidence level
    let confidence: string;
    if (score >= 70) {
      confidence = 'high';
    } else if (score >= 40) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    matches.push({
      emr_payment_id: emrPayment.id,
      invoice_number: emrPayment.invoice_number,
      customer_id: emrPayment.customer_id,
      customer_name: emrPayment.customer_name,
      confidence,
      score,
      reason: reasons.join(', ')
    });
  }

  // Sort by score descending and return top 3 matches
  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 3);
}

/**
 * Get Gravity payment summary statistics
 */
export function getGravitySummary(db: Database): {
  totalPayments: number;
  totalAmount: number;
  matchedCount: number;
  unmatchedCount: number;
  pendingReviewCount: number;
} {
  const totalResult = db.exec(`SELECT COUNT(*), COALESCE(SUM(total_amount), 0) FROM stg_gravity_payments`);
  const matchedResult = db.exec(`SELECT COUNT(*) FROM stg_gravity_payments WHERE match_status = 'matched'`);
  const unmatchedResult = db.exec(`SELECT COUNT(*) FROM stg_gravity_payments WHERE match_status = 'unmatched'`);
  const pendingResult = db.exec(`SELECT COUNT(*) FROM gravity_payment_matches WHERE match_status = 'pending'`);

  return {
    totalPayments: totalResult[0]?.values[0]?.[0] as number || 0,
    totalAmount: totalResult[0]?.values[0]?.[1] as number || 0,
    matchedCount: matchedResult[0]?.values[0]?.[0] as number || 0,
    unmatchedCount: unmatchedResult[0]?.values[0]?.[0] as number || 0,
    pendingReviewCount: pendingResult[0]?.values[0]?.[0] as number || 0
  };
}

/**
 * Get all payment matches with details
 */
export function getPaymentMatches(db: Database, options?: { status?: string }): PaymentMatch[] {
  let query = `
    SELECT
      m.id, m.payment_id, m.invoice_number, m.customer_id,
      m.match_confidence, m.match_score, m.match_status, m.match_reason,
      p.transaction_datetime, p.approval_code, p.card_last_four,
      p.total_amount, p.card_type, p.source,
      e.customer_name, e.customer_cid, e.payment_amount, e.transaction_date
    FROM gravity_payment_matches m
    JOIN stg_gravity_payments p ON m.payment_id = p.id
    LEFT JOIN stg_emr_payments e ON m.emr_payment_id = e.id
  `;

  const params: any[] = [];
  if (options?.status) {
    query += ` WHERE m.match_status = ?`;
    params.push(options.status);
  }

  query += ` ORDER BY m.created_at DESC`;

  const result = db.exec(query, params);

  if (result.length === 0) return [];

  const matches: PaymentMatch[] = [];
  for (const row of result[0].values) {
    const emrCustomerName = row[14] as string | null;
    const emrCustomerCid = row[15] as string | null;
    const emrPaymentAmount = row[16] as number | null;
    const emrTransactionDate = row[17] as string | null;
    const gravityDateTime = row[8] as string;
    const cardType = row[12] as string;
    const matchStatus = row[6] as string;

    // Format dates to display nicely (date only, no time)
    const formatDate = (dateStr: string | null): string => {
      if (!dateStr) return '';
      // Handle both ISO format (2025-12-08T10:30:00) and YYYYMMDD format
      if (dateStr.includes('T')) {
        return dateStr.split('T')[0]; // Return YYYY-MM-DD
      } else if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
        // Convert YYYYMMDD to YYYY-MM-DD
        return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      }
      return dateStr;
    };

    matches.push({
      id: row[0] as string,
      payment_id: row[1] as string,
      gravity_payment_id: row[1] as string,
      invoice_number: row[2] as string,
      customer_id: row[3] as string | null,
      match_confidence: row[4] as string,
      match_score: row[5] as number,
      match_status: matchStatus,
      status: matchStatus,
      match_reason: row[7] as string,
      payment: {
        id: row[1] as string,
        transaction_datetime: gravityDateTime,
        approval_code: row[9] as string,
        card_last_four: row[10] as string,
        total_amount: row[11] as number,
        card_type: cardType,
        source: row[13] as string,
        transaction_type: '',
        sale_amount: 0,
        tip_amount: 0,
        cashier: null,
        match_status: ''
      },
      emr_customer_name: emrCustomerName,
      emr_customer_cid: emrCustomerCid,
      emr_payment_amount: emrPaymentAmount,
      emr_transaction_date: emrTransactionDate,
      // UI-friendly aliases
      customer_name: emrCustomerName,
      customer_cid: emrCustomerCid,
      amount: emrPaymentAmount,
      card_type: cardType,
      gravity_date: formatDate(gravityDateTime),
      transaction_date: formatDate(emrTransactionDate)
    });
  }

  return matches;
}

/**
 * Get gravity payment transactions
 */
export function getGravityTransactions(db: Database, options?: { limit?: number }): GravityPayment[] {
  let query = `
    SELECT id, transaction_datetime, approval_code, transaction_type,
           card_last_four, sale_amount, tip_amount, total_amount,
           cashier, source, card_type, match_status
    FROM stg_gravity_payments
    ORDER BY transaction_datetime DESC
  `;

  if (options?.limit) {
    query += ` LIMIT ${options.limit}`;
  }

  const result = db.exec(query);

  if (result.length === 0) return [];

  const payments: GravityPayment[] = [];
  for (const row of result[0].values) {
    payments.push({
      id: row[0] as string,
      transaction_datetime: row[1] as string,
      approval_code: row[2] as string,
      transaction_type: row[3] as string,
      card_last_four: row[4] as string,
      sale_amount: row[5] as number,
      tip_amount: row[6] as number,
      total_amount: row[7] as number,
      cashier: row[8] as string | null,
      source: row[9] as string,
      card_type: row[10] as string,
      match_status: row[11] as string
    });
  }

  return payments;
}

/**
 * Approve a payment match
 */
export function approveMatch(db: Database, dbPath: string, matchId: string): { success: boolean; error?: string } {
  try {
    // Get the match details
    const matchResult = db.exec(`SELECT payment_id FROM gravity_payment_matches WHERE id = ?`, [matchId]);

    if (matchResult.length === 0 || matchResult[0].values.length === 0) {
      return { success: false, error: 'Match not found' };
    }

    const paymentId = matchResult[0].values[0][0] as string;

    // Update match status
    db.run(`
      UPDATE gravity_payment_matches
      SET match_status = 'approved', approved_at = datetime('now'), approved_by = 'user'
      WHERE id = ?
    `, [matchId]);

    // Update payment match status
    db.run(`
      UPDATE stg_gravity_payments
      SET match_status = 'matched'
      WHERE id = ?
    `, [paymentId]);

    logAudit(db, 'gravity_match_approved', 'gravity_match', matchId, { paymentId });
    saveDatabase(db, dbPath);

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Reject a payment match
 */
export function rejectMatch(db: Database, dbPath: string, matchId: string): { success: boolean; error?: string } {
  try {
    // Update match status
    db.run(`
      UPDATE gravity_payment_matches
      SET match_status = 'rejected'
      WHERE id = ?
    `, [matchId]);

    logAudit(db, 'gravity_match_rejected', 'gravity_match', matchId, {});
    saveDatabase(db, dbPath);

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

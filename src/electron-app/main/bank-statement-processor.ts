import { Database } from 'sql.js';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { BankStatement } from './types';

interface BankStatementRow {
  Date: string;
  'No.': string;
  Description: string;
  Debit: string;
  Credit: string;
}

interface ProcessingStats {
  totalRows: number;
  deposits: number;
  withdrawals: number;
  fees: number;
  unclassified: number;
}

/**
 * Process bank statement CSV file
 */
export async function processBankStatement(
  db: Database,
  filePath: string
): Promise<{ uploadId: string; stats: ProcessingStats }> {
  console.log('[Bank Statement] Processing file:', filePath);

  // Read the CSV file
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows: BankStatementRow[] = XLSX.utils.sheet_to_json(worksheet);

  console.log(`[Bank Statement] Parsed ${rows.length} rows from CSV`);

  // Create upload record
  const uploadId = uuidv4();
  db.run(
    `INSERT INTO file_uploads (id, filename, file_type, row_count, uploaded_at, status)
     VALUES (?, ?, ?, ?, datetime('now'), ?)`,
    [uploadId, filePath.split('/').pop() || 'bank_statement.csv', 'bank_statement', rows.length, 'processing']
  );

  const stats: ProcessingStats = {
    totalRows: rows.length,
    deposits: 0,
    withdrawals: 0,
    fees: 0,
    unclassified: 0,
  };

  // Process each row
  for (const row of rows) {
    try {
      const transaction = parseBankStatementRow(row, uploadId);
      insertBankStatement(db, transaction);

      // Update stats
      if (transaction.transaction_type === 'deposit') {
        stats.deposits++;
      } else if (transaction.transaction_type === 'withdrawal') {
        stats.withdrawals++;
      } else if (transaction.transaction_type === 'fee') {
        stats.fees++;
      } else {
        stats.unclassified++;
      }
    } catch (error) {
      console.error('[Bank Statement] Error processing row:', row, error);
    }
  }

  // Update upload record
  db.run(
    `UPDATE file_uploads SET processed_at = datetime('now'), status = ? WHERE id = ?`,
    ['completed', uploadId]
  );

  // Log to audit
  db.run(
    `INSERT INTO audit_log (action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?)`,
    [
      'bank_statement_processed',
      'file_upload',
      uploadId,
      JSON.stringify(stats),
    ]
  );

  console.log('[Bank Statement] Processing complete:', stats);
  return { uploadId, stats };
}

/**
 * Parse a single bank statement row
 */
function parseBankStatementRow(row: BankStatementRow, uploadId: string): BankStatement {
  const debitAmount = parseFloat(row.Debit) || 0;
  const creditAmount = parseFloat(row.Credit) || 0;
  const description = row.Description || '';

  // Classify transaction type
  const transactionType = classifyTransaction(description, debitAmount, creditAmount);

  // Detect processor
  const processor = detectProcessor(description);

  return {
    id: uuidv4(),
    upload_id: uploadId,
    transaction_date: parseDate(row.Date),
    reference_number: row['No.'] || null,
    description,
    debit_amount: debitAmount,
    credit_amount: creditAmount,
    transaction_type: transactionType,
    processor,
    reconciliation_status: 'pending',
    notes: null,
    created_at: new Date().toISOString(),
  };
}

/**
 * Classify transaction type based on description and amounts
 */
function classifyTransaction(
  description: string,
  debit: number,
  credit: number
): 'deposit' | 'withdrawal' | 'fee' | 'other' {
  const desc = description.toLowerCase();

  // Fee patterns
  const feePatterns = [
    'fee',
    'discount',
    'charge',
    'service charge',
  ];

  if (feePatterns.some(pattern => desc.includes(pattern))) {
    return 'fee';
  }

  // Deposits (credits)
  if (credit > 0) {
    return 'deposit';
  }

  // Withdrawals (debits)
  if (debit > 0) {
    return 'withdrawal';
  }

  return 'other';
}

/**
 * Detect payment processor from transaction description
 */
function detectProcessor(description: string): 'Gravity' | 'Clover' | 'Cherry' | 'Alle' | null {
  const desc = description.toLowerCase();

  if (desc.includes('gravity')) {
    return 'Gravity';
  }

  if (desc.includes('merchant bankc') || desc.includes('clover')) {
    return 'Clover';
  }

  if (desc.includes('cherry')) {
    return 'Cherry';
  }

  if (desc.includes('galderma') || desc.includes('aspir') || desc.includes('alle')) {
    return 'Alle';
  }

  return null;
}

/**
 * Parse date string to ISO format
 */
function parseDate(dateStr: string): string {
  // Format: "11/10/2025" -> "2025-11-10"
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const year = parts[2];
    return `${year}-${month}-${day}`;
  }
  return dateStr;
}

/**
 * Insert bank statement transaction into database
 */
function insertBankStatement(db: Database, transaction: BankStatement): void {
  db.run(
    `INSERT INTO bank_statements (
      id, upload_id, transaction_date, reference_number, description,
      debit_amount, credit_amount, transaction_type, processor,
      reconciliation_status, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      transaction.id,
      transaction.upload_id,
      transaction.transaction_date,
      transaction.reference_number,
      transaction.description,
      transaction.debit_amount,
      transaction.credit_amount,
      transaction.transaction_type,
      transaction.processor,
      transaction.reconciliation_status,
      transaction.notes,
      transaction.created_at,
    ]
  );
}

/**
 * Get bank statements from database
 */
export function getBankStatements(
  db: Database,
  options?: { uploadId?: string; limit?: number; offset?: number }
): BankStatement[] {
  let query = `
    SELECT * FROM bank_statements
    WHERE 1=1
  `;

  const params: any[] = [];

  if (options?.uploadId) {
    query += ` AND upload_id = ?`;
    params.push(options.uploadId);
  }

  query += ` ORDER BY transaction_date DESC, created_at DESC`;

  if (options?.limit) {
    query += ` LIMIT ?`;
    params.push(options.limit);
  }

  if (options?.offset) {
    query += ` OFFSET ?`;
    params.push(options.offset);
  }

  const stmt = db.prepare(query);
  stmt.bind(params);

  const results: BankStatement[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as BankStatement);
  }
  stmt.free();

  return results;
}

/**
 * Get bank statement summary statistics
 */
export function getBankStatementSummary(
  db: Database,
  uploadId?: string
): {
  totalTransactions: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalFees: number;
  depositAmount: number;
  withdrawalAmount: number;
  feeAmount: number;
} {
  let query = `
    SELECT
      COUNT(*) as total_transactions,
      SUM(CASE WHEN transaction_type = 'deposit' THEN 1 ELSE 0 END) as total_deposits,
      SUM(CASE WHEN transaction_type = 'withdrawal' THEN 1 ELSE 0 END) as total_withdrawals,
      SUM(CASE WHEN transaction_type = 'fee' THEN 1 ELSE 0 END) as total_fees,
      SUM(CASE WHEN transaction_type = 'deposit' THEN credit_amount ELSE 0 END) as deposit_amount,
      SUM(CASE WHEN transaction_type = 'withdrawal' THEN debit_amount ELSE 0 END) as withdrawal_amount,
      SUM(CASE WHEN transaction_type = 'fee' THEN debit_amount ELSE 0 END) as fee_amount
    FROM bank_statements
    WHERE 1=1
  `;

  const params: any[] = [];

  if (uploadId) {
    query += ` AND upload_id = ?`;
    params.push(uploadId);
  }

  const stmt = db.prepare(query);
  stmt.bind(params);

  let result: any = {
    totalTransactions: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalFees: 0,
    depositAmount: 0,
    withdrawalAmount: 0,
    feeAmount: 0,
  };

  if (stmt.step()) {
    const row = stmt.getAsObject();
    result = {
      totalTransactions: Number(row.total_transactions) || 0,
      totalDeposits: Number(row.total_deposits) || 0,
      totalWithdrawals: Number(row.total_withdrawals) || 0,
      totalFees: Number(row.total_fees) || 0,
      depositAmount: Number(row.deposit_amount) || 0,
      withdrawalAmount: Number(row.withdrawal_amount) || 0,
      feeAmount: Number(row.fee_amount) || 0,
    };
  }

  stmt.free();
  return result;
}

/**
 * Get bank deposits grouped by processor
 */
export function getDepositsByProcessor(
  db: Database,
  uploadId?: string
): Array<{ processor: string; count: number; total_amount: number }> {
  let query = `
    SELECT
      COALESCE(processor, 'Unknown') as processor,
      COUNT(*) as count,
      SUM(credit_amount) as total_amount
    FROM bank_statements
    WHERE transaction_type = 'deposit'
  `;

  const params: any[] = [];

  if (uploadId) {
    query += ` AND upload_id = ?`;
    params.push(uploadId);
  }

  query += ` GROUP BY processor ORDER BY total_amount DESC`;

  const stmt = db.prepare(query);
  stmt.bind(params);

  const results: Array<{ processor: string; count: number; total_amount: number }> = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      processor: String(row.processor),
      count: Number(row.count),
      total_amount: Number(row.total_amount),
    });
  }
  stmt.free();

  return results;
}

import type { Database } from 'sql.js';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logAudit, saveDatabase } from './database';

interface CCRow {
  'Transaction Date'?: string;
  'Posted Date'?: string;
  'Card No.'?: string;
  'Description'?: string;
  'Category'?: string;
  'Debit'?: number | string;
  'Credit'?: number | string;
  // Alternative column names
  Date?: string;
  Merchant?: string;
  Amount?: number | string;
  [key: string]: any;
}

interface ProcessResult {
  success: boolean;
  uploadId: string;
  stats: {
    totalRows: number;
    expenseCount: number;
    creditCount: number;
    categorizedCount: number;
    uncategorizedMerchants: string[];
  };
  error?: string;
}

/**
 * Normalize column names to handle variations in CC statement formats
 */
function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Extract value from row with flexible column name matching
 */
function getColumnValue(row: CCRow, ...possibleNames: string[]): any {
  for (const name of possibleNames) {
    // Direct match
    if (row[name] !== undefined) return row[name];

    // Normalized match
    const normalizedTarget = normalizeColumnName(name);
    for (const key of Object.keys(row)) {
      if (normalizeColumnName(key) === normalizedTarget) {
        return row[key];
      }
    }
  }
  return null;
}

/**
 * Parse date from various formats
 */
function parseDate(dateStr: string | number | null): string | null {
  if (!dateStr) return null;

  // Handle Excel serial date numbers
  if (typeof dateStr === 'number') {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + dateStr * 86400000);
    return date.toISOString().split('T')[0];
  }

  const str = String(dateStr).trim();

  // Try various date formats
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/,           // YYYY-MM-DD
    /^(\d{2})\/(\d{2})\/(\d{4})$/,         // MM/DD/YYYY
    /^(\d{2})-(\d{2})-(\d{4})$/,           // MM-DD-YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/,   // M/D/YY or M/D/YYYY
  ];

  for (const format of formats) {
    const match = str.match(format);
    if (match) {
      let year, month, day;
      if (format.source.startsWith('^(\\d{4})')) {
        [, year, month, day] = match;
      } else {
        [, month, day, year] = match;
        if (year.length === 2) {
          year = (parseInt(year) > 50 ? '19' : '20') + year;
        }
      }
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
  }

  // Try native parsing as fallback
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

  // Remove currency symbols and commas
  const cleaned = String(value).replace(/[$,()]/g, '').trim();
  const num = parseFloat(cleaned);

  // Handle parentheses as negative
  if (String(value).includes('(') && String(value).includes(')')) {
    return -Math.abs(num);
  }

  return isNaN(num) ? null : num;
}

/**
 * Find matching expense category for a merchant
 */
function findCategory(db: Database, merchant: string): { categoryId: string; expenseAccount: string } | null {
  if (!merchant) return null;

  const result = db.exec(`
    SELECT id, expense_account
    FROM expense_categories
    WHERE is_active = 1 AND ? LIKE '%' || merchant_pattern || '%'
    LIMIT 1
  `, [merchant.toLowerCase()]);

  if (result.length > 0 && result[0].values.length > 0) {
    return {
      categoryId: result[0].values[0][0] as string,
      expenseAccount: result[0].values[0][1] as string,
    };
  }

  return null;
}

/**
 * Process a CC statement file
 */
export function processCCFile(
  db: Database,
  dbPath: string,
  filePath: string
): ProcessResult {
  try {
    // Read the file
    const buffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

    // Get the first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows: CCRow[] = XLSX.utils.sheet_to_json(worksheet);

    if (rows.length === 0) {
      return {
        success: false,
        uploadId: '',
        stats: { totalRows: 0, expenseCount: 0, creditCount: 0, categorizedCount: 0, uncategorizedMerchants: [] },
        error: 'No data found in file',
      };
    }

    // Create upload record
    const uploadId = uuidv4();
    const filename = filePath.split(/[/\\]/).pop() || 'unknown';

    db.run(`
      INSERT INTO file_uploads (id, filename, file_type, status, row_count)
      VALUES (?, ?, 'cc_statement', 'processing', ?)
    `, [uploadId, filename, rows.length]);

    let expenseCount = 0;
    let creditCount = 0;
    let categorizedCount = 0;
    const uncategorizedMerchants = new Set<string>();

    // Process each row
    for (const row of rows) {
      // Extract fields with flexible column matching
      const transactionDate = parseDate(
        getColumnValue(row, 'Transaction Date', 'Date', 'Trans Date', 'TxnDate')
      );
      const postedDate = parseDate(
        getColumnValue(row, 'Posted Date', 'Post Date', 'PostedDate')
      );
      const cardLastFour = getColumnValue(row, 'Card No.', 'Card', 'Card Number', 'Last4');
      const merchant = getColumnValue(row, 'Description', 'Merchant', 'Name', 'Payee') || '';
      const ccCategory = getColumnValue(row, 'Category', 'Type', 'Transaction Type');

      // Handle debit/credit amounts
      let amount: number | null = null;
      const debit = parseAmount(getColumnValue(row, 'Debit', 'Charge', 'Purchase'));
      const credit = parseAmount(getColumnValue(row, 'Credit', 'Payment', 'Return'));
      const singleAmount = parseAmount(getColumnValue(row, 'Amount', 'Transaction Amount'));

      if (debit !== null && debit !== 0) {
        amount = Math.abs(debit); // Expenses are positive
        expenseCount++;
      } else if (credit !== null && credit !== 0) {
        amount = -Math.abs(credit); // Credits/payments are negative
        creditCount++;
      } else if (singleAmount !== null) {
        amount = singleAmount;
        if (singleAmount > 0) expenseCount++;
        else creditCount++;
      }

      if (amount === null || amount === 0) continue;

      // Find category for merchant
      const categoryMatch = findCategory(db, merchant);
      let categoryId: string | null = null;
      let expenseAccount: string | null = null;

      if (categoryMatch) {
        categoryId = categoryMatch.categoryId;
        expenseAccount = categoryMatch.expenseAccount;
        categorizedCount++;
      } else if (merchant && amount > 0) {
        // Only track uncategorized expenses (not credits)
        uncategorizedMerchants.add(merchant);
      }

      // Insert expense transaction
      const txnId = uuidv4();
      db.run(`
        INSERT INTO expense_transactions (
          id, upload_id, transaction_date, posted_date, card_last_four,
          merchant, capital_one_category, amount, category_id, expense_account,
          status, transaction_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'staged', ?)
      `, [
        txnId,
        uploadId,
        transactionDate,
        postedDate,
        cardLastFour,
        merchant,
        ccCategory,
        amount,
        categoryId,
        expenseAccount,
        JSON.stringify(row),
      ]);
    }

    // Update upload status
    db.run(`
      UPDATE file_uploads
      SET status = 'processed', processed_at = datetime('now')
      WHERE id = ?
    `, [uploadId]);

    logAudit(db, 'cc_statement_processed', 'file_upload', uploadId, {
      filename,
      totalRows: rows.length,
      expenseCount,
      creditCount,
      categorizedCount,
    });

    saveDatabase(db, dbPath);

    return {
      success: true,
      uploadId,
      stats: {
        totalRows: rows.length,
        expenseCount,
        creditCount,
        categorizedCount,
        uncategorizedMerchants: Array.from(uncategorizedMerchants).slice(0, 20),
      },
    };
  } catch (error: any) {
    console.error('Error processing CC file:', error);
    return {
      success: false,
      uploadId: '',
      stats: { totalRows: 0, expenseCount: 0, creditCount: 0, categorizedCount: 0, uncategorizedMerchants: [] },
      error: error.message,
    };
  }
}

/**
 * Get expense transactions summary
 */
export function getExpenseSummary(db: Database, uploadId?: string): {
  totalExpenses: number;
  totalCredits: number;
  categorizedCount: number;
  uncategorizedCount: number;
} {
  let whereClause = '';
  const params: any[] = [];

  if (uploadId) {
    whereClause = 'WHERE upload_id = ?';
    params.push(uploadId);
  }

  const result = db.exec(`
    SELECT
      SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_expenses,
      SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_credits,
      SUM(CASE WHEN category_id IS NOT NULL THEN 1 ELSE 0 END) as categorized_count,
      SUM(CASE WHEN category_id IS NULL AND amount > 0 THEN 1 ELSE 0 END) as uncategorized_count
    FROM expense_transactions
    ${whereClause}
  `, params);

  if (result.length > 0 && result[0].values.length > 0) {
    const [totalExpenses, totalCredits, categorizedCount, uncategorizedCount] = result[0].values[0];
    return {
      totalExpenses: totalExpenses as number || 0,
      totalCredits: totalCredits as number || 0,
      categorizedCount: categorizedCount as number || 0,
      uncategorizedCount: uncategorizedCount as number || 0,
    };
  }

  return { totalExpenses: 0, totalCredits: 0, categorizedCount: 0, uncategorizedCount: 0 };
}

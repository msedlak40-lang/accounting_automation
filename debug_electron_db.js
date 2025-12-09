// Debug script to check what's in the Electron database
const fs = require('fs');
const initSqlJs = require('sql.js');

async function checkDatabase() {
  const SQL = await initSqlJs();
  const dbPath = './src/electron-app/accounting.db';

  if (!fs.existsSync(dbPath)) {
    console.log('❌ Database not found at:', dbPath);
    return;
  }

  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  console.log('\n=== DATABASE DIAGNOSTICS ===\n');

  // Check Gravity payments
  const gravityCount = db.exec('SELECT COUNT(*) FROM stg_gravity_payments');
  console.log('Gravity payments:', gravityCount[0]?.values[0]?.[0] || 0);

  // Check EMR transactions (staging)
  const emrTxnCount = db.exec('SELECT COUNT(*) FROM transactions_staging');
  console.log('EMR transactions (staging):', emrTxnCount[0]?.values[0]?.[0] || 0);

  // Check unique invoices
  const invoiceCount = db.exec(`
    SELECT COUNT(DISTINCT invoice_number)
    FROM transactions_staging
    WHERE invoice_number IS NOT NULL
      AND json_extract(transaction_data, '$.totalDue') IS NOT NULL
  `);
  console.log('Unique invoices with Total Due:', invoiceCount[0]?.values[0]?.[0] || 0);

  // Check EMR payments table
  const emrPaymentCount = db.exec('SELECT COUNT(*) FROM stg_emr_payments');
  console.log('EMR payment lines:', emrPaymentCount[0]?.values[0]?.[0] || 0);

  // Check matches
  const matchCount = db.exec('SELECT COUNT(*) FROM gravity_payment_matches');
  console.log('Payment matches created:', matchCount[0]?.values[0]?.[0] || 0);

  // Sample invoice calculation
  console.log('\n=== SAMPLE INVOICE CALCULATION ===\n');
  const sampleInvoice = db.exec(`
    SELECT
      t.invoice_number,
      t.transaction_date,
      SUM(CAST(json_extract(t.transaction_data, '$.totalDue') AS REAL)) as total_due_sum,
      COALESCE(SUM(
        CASE
          WHEN LOWER(p.payment_type) IN ('alle rewards', 'aspire awards', 'client bank', 'reward points', 'square gift card')
          THEN p.payment_amount
          ELSE 0
        END
      ), 0) as reward_amount,
      (SUM(CAST(json_extract(t.transaction_data, '$.totalDue') AS REAL)) -
       COALESCE(SUM(
         CASE
           WHEN LOWER(p.payment_type) IN ('alle rewards', 'aspire awards', 'client bank', 'reward points', 'square gift card')
           THEN p.payment_amount
           ELSE 0
         END
       ), 0)) as invoice_total,
      COUNT(*) as line_count
    FROM transactions_staging t
    LEFT JOIN stg_emr_payments p ON t.invoice_number = p.invoice_number
    WHERE t.invoice_number IS NOT NULL
      AND json_extract(t.transaction_data, '$.totalDue') IS NOT NULL
    GROUP BY t.invoice_number, t.transaction_date
    LIMIT 5
  `);

  if (sampleInvoice[0]?.values.length > 0) {
    console.log('Sample invoice calculations:');
    sampleInvoice[0].values.forEach(row => {
      console.log(`  Invoice: ${row[0]}, Date: ${row[1]}`);
      console.log(`    Total Due: $${row[2]}, Rewards: $${row[3]}, Net: $${row[4]} (${row[5]} lines)`);
    });
  }

  // Check date range
  console.log('\n=== DATE RANGES ===\n');
  const emrDates = db.exec(`
    SELECT MIN(transaction_date), MAX(transaction_date)
    FROM transactions_staging
  `);
  console.log('EMR date range:', emrDates[0]?.values[0]?.[0], 'to', emrDates[0]?.values[0]?.[1]);

  const gravityDates = db.exec(`
    SELECT MIN(DATE(transaction_datetime)), MAX(DATE(transaction_datetime))
    FROM stg_gravity_payments
  `);
  console.log('Gravity date range:', gravityDates[0]?.values[0]?.[0], 'to', gravityDates[0]?.values[0]?.[1]);

  db.close();
}

checkDatabase().catch(console.error);

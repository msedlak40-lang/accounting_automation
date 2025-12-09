const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function debugMatching() {
  // Initialize SQL.js
  const SQL = await initSqlJs({
    locateFile: () => path.join(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm')
  });

  // Load database
  const dbPath = path.join(__dirname, 'accounting.db');
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  console.log('\n=== GRAVITY PAYMENT ($387.05 on 2025-10-08) ===');
  const gravityResult = db.exec(`
    SELECT id, transaction_datetime, total_amount, card_type, match_status
    FROM stg_gravity_payments
    WHERE ABS(total_amount - 387.05) < 0.01
      AND DATE(transaction_datetime) = '2025-10-08'
    LIMIT 1
  `);
  if (gravityResult.length > 0) {
    console.log('Found Gravity payment:');
    gravityResult[0].values.forEach(row => {
      console.log(`  ID: ${row[0]}, DateTime: ${row[1]}, Amount: $${row[2]}, Card: ${row[3]}, Status: ${row[4]}`);
    });
  } else {
    console.log('No Gravity payment found!');
  }

  console.log('\n=== EMR PAYMENT RECORDS (around that date/amount) ===');
  const emrPaymentsResult = db.exec(`
    SELECT invoice_number, customer_name, transaction_date, payment_type, payment_amount, match_status
    FROM stg_emr_payments
    WHERE DATE(transaction_date) BETWEEN '2025-10-01' AND '2025-10-15'
      AND LOWER(payment_type) IN ('visa', 'mastercard', 'amex', 'discover')
    ORDER BY ABS(payment_amount - 387.05)
    LIMIT 10
  `);
  if (emrPaymentsResult.length > 0) {
    console.log('Found EMR payment records:');
    emrPaymentsResult[0].values.forEach(row => {
      console.log(`  Invoice: ${row[0]}, Customer: ${row[1]}, Date: ${row[2]}, Type: ${row[3]}, Amount: $${row[4]}, Status: ${row[5]}`);
    });
  } else {
    console.log('No EMR payment records found!');
  }

  console.log('\n=== SERVICE LINES (transactions_staging with Total Due) ===');
  const servicesResult = db.exec(`
    SELECT invoice_number, transaction_date, service_name,
           json_extract(transaction_data, '$.totalDue') as total_due,
           transaction_data
    FROM transactions_staging
    WHERE invoice_number IN (
      SELECT DISTINCT invoice_number
      FROM stg_emr_payments
      WHERE DATE(transaction_date) BETWEEN '2025-10-01' AND '2025-10-15'
        AND LOWER(payment_type) IN ('visa', 'mastercard', 'amex', 'discover')
    )
    ORDER BY invoice_number
    LIMIT 30
  `);
  if (servicesResult.length > 0) {
    console.log('Found service line records:');
    const grouped = {};
    servicesResult[0].values.forEach(row => {
      const invoice = row[0];
      const totalDue = row[3];
      if (!grouped[invoice]) {
        grouped[invoice] = { date: row[1], services: [], total: 0 };
      }
      grouped[invoice].services.push({ service: row[2], totalDue: totalDue });
      grouped[invoice].total += (totalDue || 0);
    });

    Object.keys(grouped).forEach(invoice => {
      const data = grouped[invoice];
      console.log(`\n  Invoice: ${invoice}, Date: ${data.date}, Sum of Total Due: $${data.total.toFixed(2)}`);
      data.services.forEach(svc => {
        console.log(`    - ${svc.service}: $${svc.totalDue}`);
      });
    });
  } else {
    console.log('No service line records found!');
  }

  console.log('\n=== TESTING THE MATCHING QUERY ===');
  const matchTestResult = db.exec(`
    SELECT
      p.invoice_number,
      p.customer_name,
      p.transaction_date,
      p.payment_type,
      COALESCE(SUM(
        CAST(json_extract(t.transaction_data, '$.totalDue') AS REAL)
      ), 0) as invoice_total
    FROM stg_emr_payments p
    LEFT JOIN transactions_staging t ON p.invoice_number = t.invoice_number
    WHERE p.match_status = 'unmatched'
      AND DATE(p.transaction_date) BETWEEN '2025-10-01' AND '2025-10-15'
      AND LOWER(p.payment_type) IN ('visa', 'mastercard', 'amex', 'discover')
    GROUP BY p.id, p.invoice_number, p.customer_id, p.customer_name, p.transaction_date, p.payment_type
    HAVING ABS(invoice_total - 387.05) < 5.00
    ORDER BY ABS(invoice_total - 387.05)
    LIMIT 10
  `);
  if (matchTestResult.length > 0) {
    console.log('Found potential matches:');
    matchTestResult[0].values.forEach(row => {
      console.log(`  Invoice: ${row[0]}, Customer: ${row[1]}, Date: ${row[2]}, Type: ${row[3]}, Invoice Total: $${row[4]}`);
    });
  } else {
    console.log('No matches found with the query!');
  }

  db.close();
}

debugMatching().catch(console.error);

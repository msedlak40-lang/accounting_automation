// Reset Gravity payment matches to allow re-processing
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'processing', 'medspa_data.db');

async function resetMatches() {
  console.log('Initializing SQL.js...');
  const SQL = await initSqlJs();

  console.log(`Loading database from: ${DB_PATH}`);
  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  console.log('Resetting Gravity payment matches...');

  // Begin transaction
  db.run('BEGIN TRANSACTION');

  // 1. Delete all existing match records
  console.log('  - Deleting existing match records...');
  db.run('DELETE FROM gravity_payment_matches');

  // 2. Reset all Gravity payment statuses to 'unmatched'
  console.log('  - Resetting Gravity payment statuses...');
  db.run("UPDATE stg_gravity_payments SET match_status = 'unmatched'");

  // 3. Reset EMR payment statuses
  console.log('  - Resetting EMR payment statuses...');
  db.run("UPDATE stg_emr_payments SET match_status = 'unmatched', matched_payment_id = NULL");

  // Commit transaction
  db.run('COMMIT');

  // Get counts to verify
  const result = db.exec(`
    SELECT 'Gravity payments (unmatched)' as status, COUNT(*) as count
    FROM stg_gravity_payments WHERE match_status = 'unmatched'
    UNION ALL
    SELECT 'Match records (should be 0)', COUNT(*)
    FROM gravity_payment_matches
    UNION ALL
    SELECT 'EMR payments (unmatched)', COUNT(*)
    FROM stg_emr_payments WHERE match_status = 'unmatched'
  `);

  console.log('\nReset complete! Verification:');
  if (result.length > 0) {
    result[0].values.forEach(row => {
      console.log(`  ${row[0]}: ${row[1]}`);
    });
  }

  // Save database
  console.log('\nSaving database...');
  const data = db.export();
  fs.writeFileSync(DB_PATH, data);

  db.close();
  console.log('✓ Done! You can now click "Match Payments" in the UI to re-run matching with the improved algorithm.');
}

resetMatches().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

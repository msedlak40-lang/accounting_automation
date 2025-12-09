// List all tables in the database
const fs = require('fs');
const initSqlJs = require('sql.js');

async function listTables() {
  const SQL = await initSqlJs();
  const dbPath = './src/electron-app/accounting.db';

  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  const tables = db.exec(`
    SELECT name FROM sqlite_master
    WHERE type='table'
    ORDER BY name
  `);

  console.log('\nTables in database:');
  if (tables[0]?.values.length > 0) {
    tables[0].values.forEach(row => {
      console.log(`  - ${row[0]}`);
    });
  } else {
    console.log('  (no tables found)');
  }

  db.close();
}

listTables().catch(console.error);

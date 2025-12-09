// Reinitialize the Electron database with all tables
const fs = require('fs');
const initSqlJs = require('sql.js');

async function reinitDatabase() {
  console.log('\n=== REINITIALIZING DATABASE ===\n');

  const SQL = await initSqlJs();
  const dbPath = './src/electron-app/accounting.db';

  // Backup existing database
  if (fs.existsSync(dbPath)) {
    const backupPath = `${dbPath}.backup-${Date.now()}`;
    fs.copyFileSync(dbPath, backupPath);
    console.log(`✓ Backed up existing database to: ${backupPath}`);
  }

  // Load existing database to preserve service_mappings and payment_type_mappings
  let db;
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log('✓ Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('✓ Created new database');
  }

  // Read the schema from database.ts and execute
  const databaseTs = fs.readFileSync('./src/electron-app/main/database.ts', 'utf8');

  // Extract the SQL from the createTables function
  const sqlMatch = databaseTs.match(/const queries = `([\s\S]*?)`;[\s\S]*?database\.exec\(queries\)/);

  if (!sqlMatch) {
    console.error('❌ Could not extract SQL schema from database.ts');
    process.exit(1);
  }

  const schema = sqlMatch[1];

  console.log('\n✓ Executing schema...\n');

  try {
    db.exec(schema);
    console.log('✓ All tables created successfully');

    // List tables
    const tables = db.exec(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `);

    console.log('\nTables in database:');
    if (tables[0]?.values.length > 0) {
      tables[0].values.forEach((row, idx) => {
        console.log(`  ${idx + 1}. ${row[0]}`);
      });
      console.log(`\nTotal: ${tables[0].values.length} tables`);
    }

    // Save database
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
    console.log(`\n✓ Database saved to: ${dbPath}`);

    console.log('\n✓ Database reinitialization complete!');
    console.log('\nNext steps:');
    console.log('  1. Start the Electron app: cd src/electron-app && npm run dev');
    console.log('  2. Upload EMR transactions through the UI');
    console.log('  3. Upload Gravity payments through the UI');
    console.log('  4. Run payment matching through the UI');

  } catch (error) {
    console.error('❌ Error creating tables:', error);
    process.exit(1);
  }

  db.close();
}

reinitDatabase().catch(console.error);

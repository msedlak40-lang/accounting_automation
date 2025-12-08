#!/usr/bin/env node

/**
 * Seed service_mappings and payment_type_mappings tables
 * from COA_Quickbooks_matched.xlsx
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Simple XLSX parser using Python since Node xlsx isn't installed
const { execSync } = require('child_process');

const DB_PATH = path.join(__dirname, '../src/electron-app/accounting.db');
const EXCEL_PATH = path.join(__dirname, '../data/raw/COA_Quickbooks_matched.xlsx');

async function seedDatabase() {
  console.log('🌱 Starting database seeding...\n');

  // Read Excel data using Python
  console.log('📊 Reading Excel file...');
  const pythonScript = `
import openpyxl
import json

wb = openpyxl.load_workbook('${EXCEL_PATH}', data_only=True)

# Read service mappings
services = []
if 'emr_service_items' in wb.sheetnames:
    ws = wb['emr_service_items']
    headers = [cell.value for cell in ws[1]]
    for row in ws.iter_rows(min_row=2, values_only=True):
        services.append(dict(zip(headers, row)))

# Read payment mappings
payments = []
if 'emr_payment_types' in wb.sheetnames:
    ws = wb['emr_payment_types']
    headers = [cell.value for cell in ws[1]]
    for row in ws.iter_rows(min_row=2, values_only=True):
        payments.append(dict(zip(headers, row)))

print(json.dumps({'services': services, 'payments': payments}))
`;

  const excelData = JSON.parse(execSync(`python3 -c "${pythonScript}"`).toString());

  console.log(`  ✓ Found ${excelData.services.length} service mappings`);
  console.log(`  ✓ Found ${excelData.payments.length} payment types\n`);

  // Initialize SQL.js
  const SQL = await initSqlJs({
    locateFile: () => path.join(__dirname, '../src/electron-app/node_modules/sql.js/dist/sql-wasm.wasm')
  });

  // Load database
  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ Database not found at:', DB_PATH);
    console.log('Please start the Electron app first to create the database.');
    process.exit(1);
  }

  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  console.log('💾 Database loaded\n');

  // Clear existing data (optional - comment out if you want to keep existing data)
  console.log('🗑️  Clearing existing mappings...');
  db.run('DELETE FROM service_mappings');
  db.run('DELETE FROM payment_type_mappings');
  console.log('  ✓ Cleared\n');

  // Insert service mappings
  console.log('📥 Inserting service mappings...');
  const serviceStmt = db.prepare(`
    INSERT INTO service_mappings (
      id, emr_service_name, qb_item_name, qb_item_hierarchy,
      asset_account, income_account, tax_code, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  let serviceCount = 0;
  for (const svc of excelData.services) {
    // Skip if service name is null
    if (!svc['Service/Product']) continue;

    const itemName = svc['Matched_Item'] || '';
    const itemHierarchy = itemName.includes(':') ? itemName.split(':')[0] : '';

    serviceStmt.run([
      uuidv4(),
      svc['Service/Product'],
      itemName,
      itemHierarchy,
      svc['Asset Account'] || null,
      svc['Account'] || '',
      svc['Tax Code'] || 'Non'
    ]);
    serviceCount++;
  }
  serviceStmt.free();
  console.log(`  ✓ Inserted ${serviceCount} service mappings\n`);

  // Insert payment type mappings
  console.log('📥 Inserting payment type mappings...');

  // Define clearing accounts based on payment type categories
  const paymentMappings = {
    'Alle Rewards': {
      category: 'vendor_receivable',
      clearing_account: '1200 · Accounts Receivable:1220 · Vendor Receivables:Allē Rewards'
    },
    'Aspire Awards': {
      category: 'vendor_receivable',
      clearing_account: '1200 · Accounts Receivable:1220 · Vendor Receivables:Aspire Awards'
    },
    'Cherry': {
      category: 'financing',
      clearing_account: '1200 · Accounts Receivable:1220 · Vendor Receivables:Cherry Financing'
    },
    'Amex': {
      category: 'credit_card',
      clearing_account: '1030 · Merchant Clearing'
    },
    'Visa': {
      category: 'credit_card',
      clearing_account: '1030 · Merchant Clearing'
    },
    'MasterCard': {
      category: 'credit_card',
      clearing_account: '1030 · Merchant Clearing'
    },
    'Discover': {
      category: 'credit_card',
      clearing_account: '1030 · Merchant Clearing'
    },
    'Cash': {
      category: 'cash',
      clearing_account: '1010 · Cash - Operating'
    },
    'Check': {
      category: 'check',
      clearing_account: '1020 · Undeposited Funds'
    },
    'Square Gift Card': {
      category: 'gift_card',
      clearing_account: '2300 · Gift Card Liability'
    },
    'Reward Points': {
      category: 'loyalty',
      clearing_account: '2310 · Customer Loyalty Points'
    },
    'Client Bank': {
      category: 'loyalty',
      clearing_account: '2320 · Client Bank Liability'
    }
  };

  const paymentStmt = db.prepare(`
    INSERT INTO payment_type_mappings (
      id, payment_type, category, clearing_account, is_active
    ) VALUES (?, ?, ?, ?, 1)
  `);

  let paymentCount = 0;
  for (const pmt of excelData.payments) {
    const paymentType = pmt['Payment Type'];
    if (!paymentType) continue;

    const mapping = paymentMappings[paymentType] || {
      category: 'other',
      clearing_account: '1030 · Merchant Clearing'
    };

    paymentStmt.run([
      uuidv4(),
      paymentType,
      mapping.category,
      mapping.clearing_account
    ]);
    paymentCount++;
  }
  paymentStmt.free();
  console.log(`  ✓ Inserted ${paymentCount} payment type mappings\n`);

  // Add audit log entries
  db.run(`
    INSERT INTO audit_log (action, entity_type, details)
    VALUES (?, ?, ?)
  `, [
    'seed_database',
    'mappings',
    JSON.stringify({
      service_count: serviceCount,
      payment_count: paymentCount,
      source_file: 'COA_Quickbooks_matched.xlsx',
      timestamp: new Date().toISOString()
    })
  ]);

  // Save database
  console.log('💾 Saving database...');
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log('  ✓ Saved\n');

  db.close();

  console.log('✅ Seeding complete!');
  console.log(`   📊 ${serviceCount} service mappings`);
  console.log(`   💳 ${paymentCount} payment type mappings`);
}

// Run the seeder
seedDatabase().catch(err => {
  console.error('❌ Error seeding database:', err);
  process.exit(1);
});

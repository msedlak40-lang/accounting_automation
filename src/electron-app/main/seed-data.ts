import { Database } from 'sql.js';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { saveDatabase } from './database';

interface ServiceMapping {
  emr_service_name: string;
  qb_item_name: string;
  qb_item_hierarchy?: string;
  asset_account?: string;
  income_account: string;
  tax_code?: string;
}

interface PaymentTypeMapping {
  payment_type: string;
  category: string;
  clearing_account: string;
}

/**
 * Seed service mappings from Excel file
 */
export function seedServiceMappings(
  db: Database,
  dbPath: string,
  excelPath: string
): { success: boolean; count: number; error?: string } {
  try {
    console.log(`Attempting to read Excel file from: ${excelPath}`);

    // Check if file exists
    if (!fs.existsSync(excelPath)) {
      return { success: false, count: 0, error: `Cannot access file ${excelPath}` };
    }

    // Read the Excel file as a buffer first (more reliable in Electron)
    const fileBuffer = fs.readFileSync(excelPath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    console.log('Available sheet names:', workbook.SheetNames);

    // Find the emr_service_items sheet
    if (!workbook.SheetNames.includes('emr_service_items')) {
      return {
        success: false,
        count: 0,
        error: `Sheet "emr_service_items" not found. Available sheets: ${workbook.SheetNames.join(', ')}`
      };
    }

    const sheet = workbook.Sheets['emr_service_items'];
    const data = XLSX.utils.sheet_to_json<any>(sheet);

    console.log(`Found ${data.length} service mappings to import`);

    if (data.length > 0) {
      console.log('Column names in Excel:', Object.keys(data[0]));
      console.log('First row sample:', JSON.stringify(data[0], null, 2));
    }

    let count = 0;
    const errors: string[] = [];

    for (const row of data) {
      try {
        // Map Excel columns to database fields based on actual Excel structure
        const mapping: ServiceMapping = {
          emr_service_name: row['Service/Product'],
          qb_item_name: row['Matched_Item'],
          qb_item_hierarchy: undefined, // Not in this Excel file
          asset_account: row['Asset Account'] || undefined,
          income_account: row['Account'], // This is the income account column
          tax_code: row['Tax Code'] || undefined,
        };

        // Validate required fields
        if (!mapping.emr_service_name || !mapping.qb_item_name || !mapping.income_account) {
          errors.push(`Skipping row: missing required fields (Service/Product, Matched_Item, or Account)`);
          continue;
        }

        // Check if mapping already exists
        const existing = db.exec(
          'SELECT id FROM service_mappings WHERE emr_service_name = ?',
          [mapping.emr_service_name]
        );

        if (existing.length > 0 && existing[0].values.length > 0) {
          console.log(`Service mapping already exists: ${mapping.emr_service_name}`);
          continue;
        }

        // Insert the mapping
        const id = uuidv4();
        db.run(`
          INSERT INTO service_mappings (
            id, emr_service_name, qb_item_name, qb_item_hierarchy,
            asset_account, income_account, tax_code, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `, [
          id,
          mapping.emr_service_name,
          mapping.qb_item_name,
          mapping.qb_item_hierarchy,
          mapping.asset_account,
          mapping.income_account,
          mapping.tax_code
        ]);

        count++;
      } catch (err: any) {
        errors.push(`Error processing row: ${err.message}`);
      }
    }

    // Log the import to audit log
    db.run(`
      INSERT INTO audit_log (action, entity_type, details)
      VALUES (?, ?, ?)
    `, [
      'bulk_import',
      'service_mappings',
      JSON.stringify({ count, errors: errors.slice(0, 10) })
    ]);

    // Save database
    saveDatabase(db, dbPath);

    if (errors.length > 0) {
      console.warn('Errors during import:', errors);
    }

    return { success: true, count, error: errors.length > 0 ? errors.join('; ') : undefined };
  } catch (error: any) {
    console.error('Failed to seed service mappings:', error);
    return { success: false, count: 0, error: error.message };
  }
}

/**
 * Seed payment type mappings from Excel file
 */
export function seedPaymentTypeMappings(
  db: Database,
  dbPath: string,
  excelPath: string
): { success: boolean; count: number; error?: string } {
  try {
    console.log(`Attempting to read Excel file from: ${excelPath}`);

    // Check if file exists
    if (!fs.existsSync(excelPath)) {
      return { success: false, count: 0, error: `Cannot access file ${excelPath}` };
    }

    // Read the Excel file as a buffer first (more reliable in Electron)
    const fileBuffer = fs.readFileSync(excelPath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    console.log('Available sheet names:', workbook.SheetNames);

    // Find the emr_payment_types sheet
    if (!workbook.SheetNames.includes('emr_payment_types')) {
      return {
        success: false,
        count: 0,
        error: `Sheet "emr_payment_types" not found. Available sheets: ${workbook.SheetNames.join(', ')}`
      };
    }

    const sheet = workbook.Sheets['emr_payment_types'];
    const data = XLSX.utils.sheet_to_json<any>(sheet);

    console.log(`Found ${data.length} payment type mappings to import`);

    if (data.length > 0) {
      console.log('Column names in Excel:', Object.keys(data[0]));
      console.log('First row sample:', JSON.stringify(data[0], null, 2));
    }

    let count = 0;
    const errors: string[] = [];

    for (const row of data) {
      try {
        // Map Excel columns to database fields based on actual Excel structure
        // Columns: 'Payment Type', 'desc'
        const paymentType = row['Payment Type'];
        const desc = row['desc'] || '';

        // Derive clearing account from payment type and description
        let clearingAccount = '1030 Merchant Clearing'; // default
        const descLower = desc.toLowerCase();
        const typeLower = paymentType?.toLowerCase() || '';

        if (descLower.includes('vendor receivable')) {
          // Map specific vendor receivables
          if (typeLower.includes('alle') || typeLower.includes('allergan')) {
            clearingAccount = '1210 Vendor Rec: Allergan';
          } else if (typeLower.includes('aspire') || typeLower.includes('galderma')) {
            clearingAccount = '1220 Vendor Rec: Galderma';
          } else if (typeLower.includes('cherry')) {
            clearingAccount = '1240 Vendor Rec: Cherry';
          } else {
            clearingAccount = '1200 Vendor Receivables';
          }
        } else if (descLower.includes('prepaid') || descLower.includes('client bank')) {
          clearingAccount = '1100 Client Bank / Prepaid Liab';
        } else if (descLower.includes('gift card')) {
          clearingAccount = '1150 Gift Card Liability';
        } else if (descLower.includes('merchant') || descLower.includes('clearing')) {
          clearingAccount = '1030 Merchant Clearing';
        }

        const mapping: PaymentTypeMapping = {
          payment_type: paymentType,
          category: desc || 'Merchant Clearing',
          clearing_account: clearingAccount,
        };

        // Validate required fields
        if (!mapping.payment_type) {
          errors.push(`Skipping row: missing payment type`);
          continue;
        }

        // Check if mapping already exists
        const existing = db.exec(
          'SELECT id FROM payment_type_mappings WHERE payment_type = ?',
          [mapping.payment_type]
        );

        if (existing.length > 0 && existing[0].values.length > 0) {
          console.log(`Payment type mapping already exists: ${mapping.payment_type}`);
          continue;
        }

        // Insert the mapping
        const id = uuidv4();
        db.run(`
          INSERT INTO payment_type_mappings (
            id, payment_type, category, clearing_account, is_active
          ) VALUES (?, ?, ?, ?, 1)
        `, [
          id,
          mapping.payment_type,
          mapping.category,
          mapping.clearing_account
        ]);

        count++;
      } catch (err: any) {
        errors.push(`Error processing row: ${err.message}`);
      }
    }

    // Log the import to audit log
    db.run(`
      INSERT INTO audit_log (action, entity_type, details)
      VALUES (?, ?, ?)
    `, [
      'bulk_import',
      'payment_type_mappings',
      JSON.stringify({ count, errors: errors.slice(0, 10) })
    ]);

    // Save database
    saveDatabase(db, dbPath);

    if (errors.length > 0) {
      console.warn('Errors during import:', errors);
    }

    return { success: true, count, error: errors.length > 0 ? errors.join('; ') : undefined };
  } catch (error: any) {
    console.error('Failed to seed payment type mappings:', error);
    return { success: false, count: 0, error: error.message };
  }
}

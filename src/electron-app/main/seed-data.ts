import { Database } from 'sql.js';
import * as XLSX from 'xlsx';
import * as path from 'path';
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

    // Read the Excel file
    const workbook = XLSX.readFile(excelPath);

    // Find the Service Item Mapping sheet
    if (!workbook.SheetNames.includes('Service Item Mapping')) {
      return { success: false, count: 0, error: 'Sheet "Service Item Mapping" not found' };
    }

    const sheet = workbook.Sheets['Service Item Mapping'];
    const data = XLSX.utils.sheet_to_json<any>(sheet);

    console.log(`Found ${data.length} service mappings to import`);

    let count = 0;
    const errors: string[] = [];

    for (const row of data) {
      try {
        // Map Excel columns to database fields
        // Adjust these column names based on your actual Excel structure
        const mapping: ServiceMapping = {
          emr_service_name: row['EMR Service'] || row['EMR Text'] || row['Service Name'],
          qb_item_name: row['QB Item'] || row['QuickBooks Item'],
          qb_item_hierarchy: row['Item Hierarchy'] || null,
          asset_account: row['Asset Account'] || row['Inventory Asset'] || null,
          income_account: row['Income Account'] || '4000 Injectables Income', // Default if missing
          tax_code: row['Tax Code'] || row['Tax'] || null,
        };

        // Validate required fields
        if (!mapping.emr_service_name || !mapping.qb_item_name) {
          errors.push(`Skipping row: missing EMR service or QB item name`);
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

    // Read the Excel file
    const workbook = XLSX.readFile(excelPath);

    // Find the Payment Types sheet
    if (!workbook.SheetNames.includes('Payment Types')) {
      return { success: false, count: 0, error: 'Sheet "Payment Types" not found' };
    }

    const sheet = workbook.Sheets['Payment Types'];
    const data = XLSX.utils.sheet_to_json<any>(sheet);

    console.log(`Found ${data.length} payment type mappings to import`);

    let count = 0;
    const errors: string[] = [];

    for (const row of data) {
      try {
        // Map Excel columns to database fields
        const mapping: PaymentTypeMapping = {
          payment_type: row['Payment Type'] || row['EMR Payment Type'],
          category: row['Category'] || row['Mapping Target'] || 'Merchant Clearing',
          clearing_account: row['Clearing Account'] || row['Account'] || '1030 Merchant Clearing',
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

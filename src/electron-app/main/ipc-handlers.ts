import { ipcMain } from 'electron';
import { Database, logAudit, saveDatabase } from './database';
import { seedServiceMappings, seedPaymentTypeMappings } from './seed-data';
import * as path from 'path';

/**
 * Setup IPC handlers for communication between main and renderer processes
 * All database operations happen here in the main process
 */
export function setupIpcHandlers(db: Database, dbPath: string): void {
  // Get all customers
  ipcMain.handle('customers:getAll', async () => {
    try {
      const result = db.exec('SELECT * FROM customers WHERE is_active = 1 ORDER BY customer_name_emr');
      const customers = result[0] ? result[0].values.map((row: any[]) => {
        const obj: any = {};
        result[0].columns.forEach((col: string, i: number) => {
          obj[col] = row[i];
        });
        return obj;
      }) : [];
      return { success: true, data: customers };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Create customer
  ipcMain.handle('customers:create', async (event, customerData: any) => {
    try {
      const { v4: uuidv4 } = require('uuid');
      const id = uuidv4();

      db.run(
        `INSERT INTO customers (id, cid, customer_name_emr, emr_id, customer_name_qb, qb_list_id) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          customerData.cid,
          customerData.customer_name_emr,
          customerData.emr_id,
          customerData.customer_name_qb || null,
          customerData.qb_list_id || null
        ]
      );

      // Log to audit trail
      logAudit(db, 'customer_created', 'customer', id, customerData);

      // Save database after write
      saveDatabase(db, dbPath);

      return { success: true, data: { id } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get all service mappings
  ipcMain.handle('service-mappings:getAll', async () => {
    try {
      const result = db.exec('SELECT * FROM service_mappings WHERE is_active = 1 ORDER BY emr_service_name');
      const mappings = result[0] ? result[0].values.map((row: any[]) => {
        const obj: any = {};
        result[0].columns.forEach((col: string, i: number) => {
          obj[col] = row[i];
        });
        return obj;
      }) : [];
      return { success: true, data: mappings };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Create service mapping
  ipcMain.handle('service-mappings:create', async (event, mappingData: any) => {
    try {
      const { v4: uuidv4 } = require('uuid');
      const id = uuidv4();

      db.run(
        `INSERT INTO service_mappings (id, emr_service_name, qb_item_name, qb_item_hierarchy, asset_account, income_account, tax_code) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          mappingData.emr_service_name,
          mappingData.qb_item_name,
          mappingData.qb_item_hierarchy || null,
          mappingData.asset_account || null,
          mappingData.income_account,
          mappingData.tax_code || 'Non'
        ]
      );

      logAudit(db, 'service_mapping_created', 'service_mapping', id, mappingData);

      // Save database after write
      saveDatabase(db, dbPath);

      return { success: true, data: { id } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get all payment type mappings
  ipcMain.handle('payment-types:getAll', async () => {
    try {
      const result = db.exec('SELECT * FROM payment_type_mappings WHERE is_active = 1 ORDER BY payment_type');
      const paymentTypes = result[0] ? result[0].values.map((row: any[]) => {
        const obj: any = {};
        result[0].columns.forEach((col: string, i: number) => {
          obj[col] = row[i];
        });
        return obj;
      }) : [];
      return { success: true, data: paymentTypes };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get audit log
  ipcMain.handle('audit:getLogs', async (event, options?: { limit?: number; action?: string }) => {
    try {
      let sql = 'SELECT * FROM audit_log';

      if (options?.action) {
        sql += ` WHERE action = '${options.action}'`;
      }

      sql += ' ORDER BY timestamp DESC';

      if (options?.limit) {
        sql += ` LIMIT ${options.limit}`;
      }

      const result = db.exec(sql);
      const logs = result[0] ? result[0].values.map((row: any[]) => {
        const obj: any = {};
        result[0].columns.forEach((col: string, i: number) => {
          obj[col] = row[i];
        });
        return obj;
      }) : [];
      return { success: true, data: logs };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // File upload handler (to be expanded)
  ipcMain.handle('file:upload', async (event, fileData: { path: string; type: string }) => {
    try {
      const { v4: uuidv4 } = require('uuid');
      const id = uuidv4();

      db.run(
        `INSERT INTO file_uploads (id, filename, file_type, status) VALUES (?, ?, ?, 'uploaded')`,
        [id, fileData.path.split('/').pop(), fileData.type]
      );

      logAudit(db, 'file_uploaded', 'file_upload', id, { filename: fileData.path });

      // Save database after write
      saveDatabase(db, dbPath);

      return { success: true, data: { id } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Seed service mappings from Excel
  ipcMain.handle('seed:serviceMappings', async (event, excelPath?: string) => {
    try {
      // Use provided path or default to data/raw/COA_Quickbooks_matched.xlsx
      const defaultPath = path.join(__dirname, '../../../../data/raw/COA_Quickbooks_matched.xlsx');
      const filePath = excelPath || defaultPath;

      console.log('IPC seed:serviceMappings called');
      console.log('__dirname:', __dirname);
      console.log('Resolved file path:', filePath);

      const result = seedServiceMappings(db, dbPath, filePath);
      return result;
    } catch (error: any) {
      console.error('Error in seed:serviceMappings handler:', error);
      return { success: false, count: 0, error: error.message };
    }
  });

  // Seed payment type mappings from Excel
  ipcMain.handle('seed:paymentTypeMappings', async (event, excelPath?: string) => {
    try {
      // Use provided path or default to data/raw/COA_Quickbooks_matched.xlsx
      const defaultPath = path.join(__dirname, '../../../../data/raw/COA_Quickbooks_matched.xlsx');
      const filePath = excelPath || defaultPath;

      console.log('IPC seed:paymentTypeMappings called');
      console.log('__dirname:', __dirname);
      console.log('Resolved file path:', filePath);

      const result = seedPaymentTypeMappings(db, dbPath, filePath);
      return result;
    } catch (error: any) {
      console.error('Error in seed:paymentTypeMappings handler:', error);
      return { success: false, count: 0, error: error.message };
    }
  });

  console.log('IPC handlers registered successfully');
}

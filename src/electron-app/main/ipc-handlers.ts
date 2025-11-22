import { ipcMain, dialog } from 'electron';
import { Database, logAudit, saveDatabase } from './database';
import { seedServiceMappings, seedPaymentTypeMappings } from './seed-data';
import { processEMRFile, getStagedTransactionsSummary } from './emr-processor';
import {
  importCustomerCrosswalk,
  getAllCustomersWithMappings,
  getUnmappedEMRPatients,
  getCrosswalkStats
} from './customer-crosswalk';
import { exportToTransactionPro, getExportPreview } from './transaction-pro-exporter';
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

  // Create payment type mapping
  ipcMain.handle('payment-types:create', async (event, mappingData: any) => {
    try {
      const { v4: uuidv4 } = require('uuid');
      const id = uuidv4();

      db.run(
        `INSERT INTO payment_type_mappings (id, payment_type, category, clearing_account) VALUES (?, ?, ?, ?)`,
        [
          id,
          mappingData.payment_type,
          mappingData.category,
          mappingData.clearing_account
        ]
      );

      logAudit(db, 'payment_type_created', 'payment_type', id, mappingData);

      // Save database after write
      saveDatabase(db, dbPath);

      return { success: true, data: { id } };
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

  // Open file dialog for EMR upload
  ipcMain.handle('emr:selectFile', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select EMR Transactions File',
        filters: [
          { name: 'Excel Files', extensions: ['xlsx', 'xls'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      return { success: true, filePath: result.filePaths[0] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Process EMR file
  ipcMain.handle('emr:processFile', async (event, filePath: string) => {
    try {
      console.log('Processing EMR file:', filePath);
      const result = processEMRFile(db, dbPath, filePath);
      return result;
    } catch (error: any) {
      console.error('Error in emr:processFile handler:', error);
      return { success: false, error: error.message };
    }
  });

  // Get staged transactions
  ipcMain.handle('emr:getStagedTransactions', async (event, options?: { uploadId?: string; limit?: number; offset?: number }) => {
    try {
      let sql = `
        SELECT
          ts.*,
          CASE WHEN sm.id IS NOT NULL THEN 1 ELSE 0 END as service_mapped,
          CASE WHEN pm.id IS NOT NULL THEN 1 ELSE 0 END as payment_mapped
        FROM transactions_staging ts
        LEFT JOIN service_mappings sm ON ts.service_name = sm.emr_service_name AND sm.is_active = 1
        LEFT JOIN payment_type_mappings pm ON ts.payment_type = pm.payment_type AND pm.is_active = 1
      `;

      if (options?.uploadId) {
        sql += ` WHERE ts.upload_id = '${options.uploadId}'`;
      }

      sql += ' ORDER BY ts.transaction_date DESC, ts.invoice_number';

      if (options?.limit) {
        sql += ` LIMIT ${options.limit}`;
        if (options?.offset) {
          sql += ` OFFSET ${options.offset}`;
        }
      }

      const result = db.exec(sql);
      const transactions = result[0] ? result[0].values.map((row: any[]) => {
        const obj: any = {};
        result[0].columns.forEach((col: string, i: number) => {
          obj[col] = row[i];
        });
        return obj;
      }) : [];

      return { success: true, data: transactions };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get staged transactions summary
  ipcMain.handle('emr:getSummary', async (event, uploadId?: string) => {
    try {
      const summary = getStagedTransactionsSummary(db, uploadId);
      return { success: true, data: summary };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get file uploads
  ipcMain.handle('emr:getUploads', async () => {
    try {
      const result = db.exec('SELECT * FROM file_uploads ORDER BY uploaded_at DESC');
      const uploads = result[0] ? result[0].values.map((row: any[]) => {
        const obj: any = {};
        result[0].columns.forEach((col: string, i: number) => {
          obj[col] = row[i];
        });
        return obj;
      }) : [];
      return { success: true, data: uploads };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Customer crosswalk handlers
  // Import customer crosswalk from Excel
  ipcMain.handle('customers:importCrosswalk', async (event, excelPath?: string) => {
    try {
      const defaultPath = path.join(__dirname, '../../../../data/raw/Customer_ID_Crosswalk_Template.xlsx');
      const filePath = excelPath || defaultPath;

      console.log('Importing customer crosswalk from:', filePath);
      const result = importCustomerCrosswalk(db, dbPath, filePath);
      return result;
    } catch (error: any) {
      console.error('Error in customers:importCrosswalk handler:', error);
      return { success: false, customersImported: 0, customerIdsImported: 0, uuidsImported: 0, qbCustomersImported: 0, error: error.message };
    }
  });

  // Get crosswalk stats
  ipcMain.handle('customers:getStats', async () => {
    try {
      const stats = getCrosswalkStats(db);
      return { success: true, data: stats };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get all customers with mappings
  ipcMain.handle('customers:getAllWithMappings', async () => {
    try {
      const customers = getAllCustomersWithMappings(db);
      return { success: true, data: customers };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get unmapped EMR patients from transactions
  ipcMain.handle('customers:getUnmappedEMR', async () => {
    try {
      const unmapped = getUnmappedEMRPatients(db);
      return { success: true, data: unmapped };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Select crosswalk file dialog
  ipcMain.handle('customers:selectCrosswalkFile', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Customer Crosswalk File',
        filters: [
          { name: 'Excel Files', extensions: ['xlsx', 'xls'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      return { success: true, filePath: result.filePaths[0] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Transaction Pro Export handlers
  // Select export directory
  ipcMain.handle('export:selectDirectory', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Export Directory',
        properties: ['openDirectory', 'createDirectory']
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      return { success: true, dirPath: result.filePaths[0] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get export preview
  ipcMain.handle('export:preview', async (event, uploadId?: string) => {
    try {
      const preview = getExportPreview(db, uploadId);
      return { success: true, data: preview };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Export to Transaction Pro
  ipcMain.handle('export:transactionPro', async (event, data: { outputDir: string; uploadId?: string }) => {
    try {
      console.log('Exporting to Transaction Pro:', data);
      const result = exportToTransactionPro(db, dbPath, data.outputDir, data.uploadId);
      return result;
    } catch (error: any) {
      console.error('Error in export:transactionPro handler:', error);
      return { success: false, invoicesExported: 0, paymentsExported: 0, error: error.message, warnings: [] };
    }
  });

  console.log('IPC handlers registered successfully');
}

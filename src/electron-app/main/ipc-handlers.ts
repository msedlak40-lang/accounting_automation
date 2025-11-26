import { ipcMain, dialog } from 'electron';
import { Database, logAudit, saveDatabase } from './database';
import { seedServiceMappings, seedPaymentTypeMappings } from './seed-data';
import { processEMRFile, getStagedTransactionsSummary, getFlaggedTransactions } from './emr-processor';
import {
  importCustomerCrosswalk,
  getAllCustomersWithMappings,
  getUnmappedEMRPatients,
  getCrosswalkStats,
  linkTransactionToCustomer,
  createCustomerFromFlaggedTransaction
} from './customer-crosswalk';
import { exportToTransactionPro, getExportPreview } from './transaction-pro-exporter';
import { processCCFile, getExpenseSummary } from './cc-processor';
import { processGravityFile, matchGravityPayments, getGravitySummary, getPaymentMatches } from './gravity-processor';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Setup IPC handlers for communication between main and renderer processes
 * All database operations happen here in the main process
 */
export function setupIpcHandlers(db: Database, dbPath: string): void {
  // Generic database query handler (for debugging)
  ipcMain.handle('db:query', async (event, sql: string) => {
    try {
      const result = db.exec(sql);
      if (result.length === 0) return { success: true, data: [] };

      const data = result[0].values.map((row: any[]) => {
        const obj: any = {};
        result[0].columns.forEach((col: string, i: number) => {
          obj[col] = row[i];
        });
        return obj;
      });
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get all customers (new UUID-based schema)
  ipcMain.handle('customers:getAll', async () => {
    try {
      const result = db.exec(`
        SELECT * FROM customers
        WHERE status = 'active'
        ORDER BY created_at DESC
      `);
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

  // Create customer (new UUID-based schema)
  ipcMain.handle('customers:create', async (event, customerData: any) => {
    try {
      const { v4: uuidv4 } = require('uuid');
      const customerId = customerData.customer_id || uuidv4();

      // Insert into customers table
      db.run(
        `INSERT INTO customers (customer_id, status) VALUES (?, 'active')`,
        [customerId]
      );

      // If EMR ID provided, create mapping in customer_ids
      if (customerData.emr_id) {
        db.run(
          `INSERT INTO customer_ids (customer_id, system_name, external_id) VALUES (?, 'EMR', ?)`,
          [customerId, customerData.emr_id]
        );
      }

      // If QB list ID provided, create mapping
      if (customerData.qb_list_id) {
        db.run(
          `INSERT INTO customer_ids (customer_id, system_name, external_id) VALUES (?, 'QuickBooks', ?)`,
          [customerId, customerData.qb_list_id]
        );
      }

      // Log to audit trail
      logAudit(db, 'customer_created', 'customer', customerId, customerData);

      // Save database after write
      saveDatabase(db, dbPath);

      return { success: true, data: { id: customerId } };
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

  // Get transactions flagged for review
  ipcMain.handle('emr:getFlaggedTransactions', async () => {
    try {
      const flagged = getFlaggedTransactions(db);
      return { success: true, data: flagged };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Link flagged transaction to existing customer
  ipcMain.handle('customers:linkTransaction', async (event, transactionId: string, customerId: string) => {
    try {
      const result = linkTransactionToCustomer(db, dbPath, transactionId, customerId);
      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Create new customer from flagged transaction
  ipcMain.handle('customers:createFromFlaggedTransaction', async (event, transactionId: string, emrPatientId: string, patientName: string) => {
    try {
      const result = createCustomerFromFlaggedTransaction(db, dbPath, transactionId, emrPatientId, patientName);
      return result;
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

  // Update customer names (QB display name and/or EMR name)
  ipcMain.handle('customers:updateNames', async (event, data: {
    customer_id: string;
    qb_display_name?: string;
    emr_name?: string;
    emr_patient_id?: string;
  }) => {
    try {
      const { customer_id, qb_display_name, emr_name, emr_patient_id } = data;

      // Update or insert QB display name
      if (qb_display_name !== undefined) {
        // Check if entry exists in stg_qb_customers
        const existing = db.exec(`
          SELECT qb_listid FROM stg_qb_customers WHERE customer_id = ?
        `, [customer_id]);

        if (existing.length > 0 && existing[0].values.length > 0) {
          // Update existing
          db.run(`
            UPDATE stg_qb_customers SET qb_display_name = ? WHERE customer_id = ?
          `, [qb_display_name, customer_id]);
        } else {
          // Insert new - generate a placeholder qb_listid
          const placeholderListId = `MANUAL-${customer_id.substring(0, 8)}`;
          db.run(`
            INSERT INTO stg_qb_customers (qb_listid, qb_display_name, customer_id)
            VALUES (?, ?, ?)
          `, [placeholderListId, qb_display_name, customer_id]);
        }
      }

      // Update or insert EMR name
      if (emr_name !== undefined && emr_patient_id) {
        // Check if entry exists
        const existing = db.exec(`
          SELECT emr_patient_id FROM stg_emr_patients WHERE emr_patient_id = ?
        `, [emr_patient_id]);

        if (existing.length > 0 && existing[0].values.length > 0) {
          // Update existing
          db.run(`
            UPDATE stg_emr_patients SET full_name = ?, customer_id = ? WHERE emr_patient_id = ?
          `, [emr_name, customer_id, emr_patient_id]);
        } else {
          // Insert new
          db.run(`
            INSERT INTO stg_emr_patients (emr_patient_id, full_name, customer_id)
            VALUES (?, ?, ?)
          `, [emr_patient_id, emr_name, customer_id]);
        }
      }

      logAudit(db, 'customer_names_updated', 'customer', customer_id, data);
      saveDatabase(db, dbPath);

      return { success: true };
    } catch (error: any) {
      console.error('Error updating customer names:', error);
      return { success: false, error: error.message };
    }
  });

  // Select crosswalk file dialog
  ipcMain.handle('customers:selectCrosswalkFile', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Customer Crosswalk File',
        filters: [
          { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
          { name: 'CSV Files', extensions: ['csv'] },
          { name: 'All Supported', extensions: ['xlsx', 'xls', 'csv'] }
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

  // ==================== CC STATEMENT HANDLERS ====================

  // Select CC statement file
  ipcMain.handle('cc:selectFile', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select CC Statement',
        filters: [
          { name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'csv'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, canceled: true };
      }

      return { success: true, filePath: result.filePaths[0] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Process CC statement file
  ipcMain.handle('cc:processFile', async (event, filePath: string) => {
    try {
      console.log('Processing CC file:', filePath);
      const result = processCCFile(db, dbPath, filePath);
      return result;
    } catch (error: any) {
      console.error('Error processing CC file:', error);
      return {
        success: false,
        uploadId: '',
        stats: { totalRows: 0, expenseCount: 0, creditCount: 0, categorizedCount: 0, uncategorizedMerchants: [] },
        error: error.message,
      };
    }
  });

  // Get expense transactions
  ipcMain.handle('cc:getTransactions', async (event, options?: { uploadId?: string; limit?: number }) => {
    try {
      let sql = `
        SELECT
          et.*,
          ec.category_name,
          ec.merchant_pattern
        FROM expense_transactions et
        LEFT JOIN expense_categories ec ON et.category_id = ec.id
      `;

      if (options?.uploadId) {
        sql += ` WHERE et.upload_id = '${options.uploadId}'`;
      }

      sql += ' ORDER BY et.transaction_date DESC';

      if (options?.limit) {
        sql += ` LIMIT ${options.limit}`;
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

  // Get expense summary
  ipcMain.handle('cc:getSummary', async (event, uploadId?: string) => {
    try {
      const summary = getExpenseSummary(db, uploadId);
      return { success: true, data: summary };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get expense categories
  ipcMain.handle('cc:getCategories', async () => {
    try {
      const result = db.exec(`
        SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY category_name
      `);
      const categories = result[0] ? result[0].values.map((row: any[]) => {
        const obj: any = {};
        result[0].columns.forEach((col: string, i: number) => {
          obj[col] = row[i];
        });
        return obj;
      }) : [];

      return { success: true, data: categories };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Add expense category
  ipcMain.handle('cc:addCategory', async (event, data: {
    merchant_pattern: string;
    category_name: string;
    expense_account: string;
    is_cogs?: boolean;
  }) => {
    try {
      const id = require('uuid').v4();
      db.run(`
        INSERT INTO expense_categories (id, merchant_pattern, category_name, expense_account, is_cogs)
        VALUES (?, ?, ?, ?, ?)
      `, [id, data.merchant_pattern.toLowerCase(), data.category_name, data.expense_account, data.is_cogs ? 1 : 0]);

      logAudit(db, 'expense_category_created', 'expense_category', id, data);
      saveDatabase(db, dbPath);

      return { success: true, id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Update expense transaction category
  ipcMain.handle('cc:updateTransactionCategory', async (event, data: { transactionId: string; categoryId: string | null }) => {
    try {
      let expenseAccount = null;
      if (data.categoryId) {
        const catResult = db.exec(`SELECT expense_account FROM expense_categories WHERE id = ?`, [data.categoryId]);
        if (catResult.length > 0 && catResult[0].values.length > 0) {
          expenseAccount = catResult[0].values[0][0];
        }
      }

      db.run(`
        UPDATE expense_transactions
        SET category_id = ?, expense_account = ?
        WHERE id = ?
      `, [data.categoryId, expenseAccount, data.transactionId]);

      logAudit(db, 'expense_transaction_categorized', 'expense_transaction', data.transactionId, data);
      saveDatabase(db, dbPath);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ==================== GRAVITY PAYMENT HANDLERS ====================

  // Select Gravity payment file
  ipcMain.handle('gravity:selectFile', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Gravity Payments File',
        filters: [
          { name: 'CSV Files', extensions: ['csv'] },
          { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, canceled: true };
      }

      return { success: true, filePath: result.filePaths[0] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Process Gravity payment file
  ipcMain.handle('gravity:processFile', async (event, filePath: string) => {
    try {
      console.log('Processing Gravity file:', filePath);
      const result = processGravityFile(db, dbPath, filePath);
      return result;
    } catch (error: any) {
      console.error('Error processing Gravity file:', error);
      return {
        success: false,
        uploadId: '',
        stats: { totalRows: 0, paymentCount: 0, totalAmount: 0 },
        error: error.message,
      };
    }
  });

  // Match Gravity payments to EMR invoices
  ipcMain.handle('gravity:matchPayments', async (event, uploadId?: string) => {
    try {
      console.log('Matching Gravity payments:', uploadId);
      const result = matchGravityPayments(db, dbPath, uploadId);
      return result;
    } catch (error: any) {
      console.error('Error matching Gravity payments:', error);
      return {
        success: false,
        matchCount: 0,
        unmatchedCount: 0,
        matches: [],
        error: error.message,
      };
    }
  });

  // Get Gravity payment summary
  ipcMain.handle('gravity:getSummary', async (event, uploadId?: string) => {
    try {
      const summary = getGravitySummary(db, uploadId);
      return { success: true, data: summary };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get payment matches
  ipcMain.handle('gravity:getMatches', async (event, uploadId?: string) => {
    try {
      const matches = getPaymentMatches(db, uploadId);
      return { success: true, data: matches };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get Gravity transactions
  ipcMain.handle('gravity:getTransactions', async (event, options?: { uploadId?: string; limit?: number }) => {
    try {
      let sql = `
        SELECT
          gp.*,
          pm.id as match_id,
          pm.invoice_number as matched_invoice
        FROM gravity_payments gp
        LEFT JOIN payment_matches pm ON pm.gravity_payment_id = gp.id
      `;

      if (options?.uploadId) {
        sql += ` WHERE gp.upload_id = '${options.uploadId}'`;
      }

      sql += ' ORDER BY gp.transaction_date DESC';

      if (options?.limit) {
        sql += ` LIMIT ${options.limit}`;
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

  // Approve payment match
  ipcMain.handle('gravity:approveMatch', async (event, matchId: string) => {
    try {
      db.run(`
        UPDATE payment_matches
        SET status = 'approved'
        WHERE id = ?
      `, [matchId]);

      logAudit(db, 'payment_match_approved', 'payment_match', matchId);
      saveDatabase(db, dbPath);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Reject payment match
  ipcMain.handle('gravity:rejectMatch', async (event, matchId: string) => {
    try {
      db.run(`
        UPDATE payment_matches
        SET status = 'rejected'
        WHERE id = ?
      `, [matchId]);

      logAudit(db, 'payment_match_rejected', 'payment_match', matchId);
      saveDatabase(db, dbPath);

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ==================== BACKUP/RESTORE HANDLERS ====================

  // Export database backup
  ipcMain.handle('backup:export', async () => {
    try {
      const result = await dialog.showSaveDialog({
        title: 'Export Database Backup',
        defaultPath: `medspa-backup-${new Date().toISOString().split('T')[0]}.db`,
        filters: [
          { name: 'SQLite Database', extensions: ['db'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: true, canceled: true };
      }

      // Export database to binary
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(result.filePath, buffer);

      logAudit(db, 'database_backup_exported', 'system', null, { filePath: result.filePath });
      saveDatabase(db, dbPath);

      return { success: true, filePath: result.filePath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Import database backup
  ipcMain.handle('backup:import', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Import Database Backup',
        filters: [
          { name: 'SQLite Database', extensions: ['db'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: true, canceled: true };
      }

      const backupPath = result.filePaths[0];

      // Read backup file
      const backupData = fs.readFileSync(backupPath);

      // Save to current database path (overwrite)
      fs.writeFileSync(dbPath, backupData);

      logAudit(db, 'database_backup_imported', 'system', null, { filePath: backupPath });

      return {
        success: true,
        message: 'Database restored. Please restart the application for changes to take effect.',
        requiresRestart: true,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ==================== REPORTING HANDLERS ====================

  // Get transaction report by date range
  ipcMain.handle('reports:transactionsByDateRange', async (event, data: { startDate: string; endDate: string }) => {
    try {
      const result = db.exec(`
        SELECT
          transaction_date,
          COUNT(DISTINCT invoice_number) as invoice_count,
          COUNT(*) as line_count,
          SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_revenue,
          SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_payments
        FROM transactions_staging
        WHERE transaction_date BETWEEN ? AND ?
        GROUP BY transaction_date
        ORDER BY transaction_date
      `, [data.startDate, data.endDate]);

      const report = result[0] ? result[0].values.map((row: any[]) => ({
        date: row[0],
        invoiceCount: row[1],
        lineCount: row[2],
        totalRevenue: row[3] || 0,
        totalPayments: row[4] || 0,
      })) : [];

      return { success: true, data: report };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get customer summary report
  ipcMain.handle('reports:customerSummary', async () => {
    try {
      const result = db.exec(`
        SELECT
          c.customer_id,
          COALESCE(qb.qb_display_name, ep.full_name, ts.customer_cid) as customer_name,
          COUNT(DISTINCT ts.invoice_number) as invoice_count,
          SUM(CASE WHEN ts.amount > 0 THEN ts.amount ELSE 0 END) as total_revenue,
          MIN(ts.transaction_date) as first_transaction,
          MAX(ts.transaction_date) as last_transaction
        FROM customers c
        LEFT JOIN stg_qb_customers qb ON qb.customer_id = c.customer_id
        LEFT JOIN customer_ids ci ON ci.customer_id = c.customer_id AND ci.system_name = 'EMR'
        LEFT JOIN stg_emr_patients ep ON ep.emr_patient_id = ci.external_id
        LEFT JOIN transactions_staging ts ON ts.customer_id = c.customer_id
        WHERE c.status = 'active'
        GROUP BY c.customer_id
        HAVING invoice_count > 0
        ORDER BY total_revenue DESC
        LIMIT 100
      `);

      const report = result[0] ? result[0].values.map((row: any[]) => ({
        customerId: row[0],
        customerName: row[1] || 'Unknown',
        invoiceCount: row[2] || 0,
        totalRevenue: row[3] || 0,
        firstTransaction: row[4],
        lastTransaction: row[5],
      })) : [];

      return { success: true, data: report };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get service breakdown report
  ipcMain.handle('reports:serviceBreakdown', async () => {
    try {
      const result = db.exec(`
        SELECT
          ts.service_name,
          sm.qb_item_name,
          sm.income_account,
          COUNT(*) as usage_count,
          SUM(ts.quantity) as total_quantity,
          SUM(ts.amount) as total_revenue,
          CASE WHEN sm.id IS NOT NULL THEN 1 ELSE 0 END as is_mapped
        FROM transactions_staging ts
        LEFT JOIN service_mappings sm ON ts.service_name = sm.emr_service_name AND sm.is_active = 1
        WHERE ts.service_name IS NOT NULL AND ts.service_name != ''
        GROUP BY ts.service_name
        ORDER BY total_revenue DESC
      `);

      const report = result[0] ? result[0].values.map((row: any[]) => ({
        serviceName: row[0],
        qbItemName: row[1],
        incomeAccount: row[2],
        usageCount: row[3] || 0,
        totalQuantity: row[4] || 0,
        totalRevenue: row[5] || 0,
        isMapped: row[6] === 1,
      })) : [];

      return { success: true, data: report };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get expense summary report
  ipcMain.handle('reports:expenseSummary', async () => {
    try {
      const result = db.exec(`
        SELECT
          COALESCE(ec.category_name, 'Uncategorized') as category,
          ec.expense_account,
          COUNT(*) as transaction_count,
          SUM(et.amount) as total_amount
        FROM expense_transactions et
        LEFT JOIN expense_categories ec ON et.category_id = ec.id
        WHERE et.amount > 0
        GROUP BY COALESCE(ec.category_name, 'Uncategorized')
        ORDER BY total_amount DESC
      `);

      const report = result[0] ? result[0].values.map((row: any[]) => ({
        category: row[0],
        expenseAccount: row[1],
        transactionCount: row[2] || 0,
        totalAmount: row[3] || 0,
      })) : [];

      return { success: true, data: report };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get overview stats for dashboard
  ipcMain.handle('reports:dashboardStats', async () => {
    try {
      // Revenue stats
      const revenueResult = db.exec(`
        SELECT
          SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_revenue,
          COUNT(DISTINCT invoice_number) as invoice_count,
          COUNT(DISTINCT customer_id) as customer_count
        FROM transactions_staging
      `);

      // Expense stats
      const expenseResult = db.exec(`
        SELECT
          SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_expenses,
          COUNT(*) as expense_count
        FROM expense_transactions
      `);

      // Mapping stats
      const mappingResult = db.exec(`
        SELECT
          (SELECT COUNT(*) FROM service_mappings WHERE is_active = 1) as service_mappings,
          (SELECT COUNT(*) FROM payment_type_mappings WHERE is_active = 1) as payment_mappings,
          (SELECT COUNT(*) FROM expense_categories WHERE is_active = 1) as expense_categories
      `);

      const revenue = revenueResult[0]?.values[0] || [0, 0, 0];
      const expenses = expenseResult[0]?.values[0] || [0, 0];
      const mappings = mappingResult[0]?.values[0] || [0, 0, 0];

      return {
        success: true,
        data: {
          totalRevenue: revenue[0] || 0,
          invoiceCount: revenue[1] || 0,
          customerCount: revenue[2] || 0,
          totalExpenses: expenses[0] || 0,
          expenseCount: expenses[1] || 0,
          serviceMappings: mappings[0] || 0,
          paymentMappings: mappings[1] || 0,
          expenseCategories: mappings[2] || 0,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  console.log('IPC handlers registered successfully');
}

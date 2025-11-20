import { ipcMain } from 'electron';
import Database from 'better-sqlite3';
import { logAudit } from './database';

/**
 * Setup IPC handlers for communication between main and renderer processes
 * All database operations happen here in the main process
 */
export function setupIpcHandlers(db: Database.Database): void {
  // Database query handler (for custom queries)
  ipcMain.handle('db:query', async (event, sql: string, params?: any[]) => {
    try {
      const stmt = db.prepare(sql);
      const result = params ? stmt.all(...params) : stmt.all();
      return { success: true, data: result };
    } catch (error: any) {
      console.error('Database query error:', error);
      return { success: false, error: error.message };
    }
  });

  // Get all customers
  ipcMain.handle('customers:getAll', async () => {
    try {
      const stmt = db.prepare('SELECT * FROM customers WHERE is_active = 1 ORDER BY customer_name_emr');
      const customers = stmt.all();
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

      const stmt = db.prepare(`
        INSERT INTO customers (id, cid, customer_name_emr, emr_id, customer_name_qb, qb_list_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        customerData.cid,
        customerData.customer_name_emr,
        customerData.emr_id,
        customerData.customer_name_qb || null,
        customerData.qb_list_id || null
      );

      // Log to audit trail
      logAudit(db, 'customer_created', 'customer', id, customerData);

      return { success: true, data: { id } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get all service mappings
  ipcMain.handle('service-mappings:getAll', async () => {
    try {
      const stmt = db.prepare('SELECT * FROM service_mappings WHERE is_active = 1 ORDER BY emr_service_name');
      const mappings = stmt.all();
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

      const stmt = db.prepare(`
        INSERT INTO service_mappings (
          id, emr_service_name, qb_item_name, qb_item_hierarchy,
          asset_account, income_account, tax_code
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        mappingData.emr_service_name,
        mappingData.qb_item_name,
        mappingData.qb_item_hierarchy || null,
        mappingData.asset_account || null,
        mappingData.income_account,
        mappingData.tax_code || 'Non'
      );

      logAudit(db, 'service_mapping_created', 'service_mapping', id, mappingData);

      return { success: true, data: { id } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get audit log
  ipcMain.handle('audit:getLogs', async (event, options?: { limit?: number; action?: string }) => {
    try {
      let sql = 'SELECT * FROM audit_log';
      const params: any[] = [];

      if (options?.action) {
        sql += ' WHERE action = ?';
        params.push(options.action);
      }

      sql += ' ORDER BY timestamp DESC';

      if (options?.limit) {
        sql += ' LIMIT ?';
        params.push(options.limit);
      }

      const stmt = db.prepare(sql);
      const logs = stmt.all(...params);
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

      const stmt = db.prepare(`
        INSERT INTO file_uploads (id, filename, file_type, status)
        VALUES (?, ?, ?, 'uploaded')
      `);

      stmt.run(id, fileData.path.split('/').pop(), fileData.type);

      logAudit(db, 'file_uploaded', 'file_upload', id, { filename: fileData.path });

      return { success: true, data: { id } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  console.log('IPC handlers registered successfully');
}

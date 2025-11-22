import { Database } from 'sql.js';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { saveDatabase, logAudit } from './database';

interface CustomerRecord {
  customer_id: string;
  created_at: string;
  status: string;
}

interface CustomerIdMapping {
  customer_id: string;
  system_name: string;
  external_id: string;
}

interface CrosswalkImportResult {
  success: boolean;
  customersImported: number;
  mappingsImported: number;
  error?: string;
}

/**
 * Import customer crosswalk from Excel file
 */
export function importCustomerCrosswalk(
  db: Database,
  dbPath: string,
  excelPath: string
): CrosswalkImportResult {
  try {
    console.log(`Importing customer crosswalk from: ${excelPath}`);

    if (!fs.existsSync(excelPath)) {
      return {
        success: false,
        customersImported: 0,
        mappingsImported: 0,
        error: `File not found: ${excelPath}`
      };
    }

    const fileBuffer = fs.readFileSync(excelPath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    console.log('Available sheets:', workbook.SheetNames);

    // Import customers from 'customers' sheet
    let customersImported = 0;
    if (workbook.SheetNames.includes('customers')) {
      const customersSheet = workbook.Sheets['customers'];
      const customersData = XLSX.utils.sheet_to_json<any>(customersSheet);

      console.log(`Found ${customersData.length} customers to import`);

      for (const row of customersData) {
        const customerId = row['customer_id'];
        if (!customerId) continue;

        // Check if customer already exists
        const existing = db.exec(
          `SELECT id FROM customers WHERE id = ?`,
          [customerId]
        );

        if (existing.length > 0 && existing[0].values.length > 0) {
          continue; // Already exists
        }

        // Insert customer
        db.run(`
          INSERT INTO customers (id, cid, customer_name_emr, is_active, created_at)
          VALUES (?, ?, ?, ?, ?)
        `, [
          customerId,
          customerId.substring(0, 8), // Use first 8 chars as CID placeholder
          null, // Will be populated from mappings
          row['status'] === 'active' ? 1 : 0,
          row['created_at'] || new Date().toISOString()
        ]);

        customersImported++;
      }
    }

    // Import customer ID mappings from 'customer_ids' sheet
    let mappingsImported = 0;
    const emrToCustMap = new Map<string, string>();
    const custToQbMap = new Map<string, string>();

    if (workbook.SheetNames.includes('customer_ids')) {
      const idsSheet = workbook.Sheets['customer_ids'];
      const idsData = XLSX.utils.sheet_to_json<any>(idsSheet);

      console.log(`Found ${idsData.length} customer ID mappings`);

      // First pass: collect all mappings
      for (const row of idsData) {
        const customerId = row['customer_id'];
        const systemName = row['system_name'];
        const externalId = String(row['external_id']);

        if (!customerId || !systemName || !externalId) continue;

        if (systemName === 'EMR') {
          emrToCustMap.set(externalId, customerId);
        } else if (systemName === 'QuickBooks' || systemName === 'QB') {
          custToQbMap.set(customerId, externalId);
        }

        mappingsImported++;
      }

      // Second pass: update customer records with EMR CID
      for (const [emrId, customerId] of emrToCustMap) {
        // Update the customer record with the EMR CID
        db.run(`
          UPDATE customers
          SET cid = ?, emr_id = ?
          WHERE id = ?
        `, [emrId, emrId, customerId]);

        // If we have a QB mapping for this customer, update that too
        const qbName = custToQbMap.get(customerId);
        if (qbName) {
          db.run(`
            UPDATE customers
            SET customer_name_qb = ?
            WHERE id = ?
          `, [qbName, customerId]);
        }
      }
    }

    // Log the import
    logAudit(db, 'customer_crosswalk_imported', 'customers', null, {
      customersImported,
      mappingsImported,
      emrMappings: emrToCustMap.size,
      qbMappings: custToQbMap.size
    });

    saveDatabase(db, dbPath);

    return {
      success: true,
      customersImported,
      mappingsImported
    };
  } catch (error: any) {
    console.error('Error importing customer crosswalk:', error);
    return {
      success: false,
      customersImported: 0,
      mappingsImported: 0,
      error: error.message
    };
  }
}

/**
 * Build EMR CID to Customer lookup map
 */
export function buildCIDLookup(db: Database): Map<string, { id: string; name_emr: string | null; name_qb: string | null }> {
  const map = new Map();

  const result = db.exec(`
    SELECT id, cid, customer_name_emr, customer_name_qb
    FROM customers
    WHERE is_active = 1 AND cid IS NOT NULL
  `);

  if (result.length > 0 && result[0].values) {
    for (const row of result[0].values) {
      const cid = String(row[1]);
      map.set(cid, {
        id: row[0] as string,
        name_emr: row[2] as string | null,
        name_qb: row[3] as string | null
      });
    }
  }

  return map;
}

/**
 * Get customer by EMR CID
 */
export function getCustomerByCID(db: Database, cid: string): {
  id: string;
  cid: string;
  customer_name_emr: string | null;
  customer_name_qb: string | null;
} | null {
  const result = db.exec(`
    SELECT id, cid, customer_name_emr, customer_name_qb
    FROM customers
    WHERE cid = ? AND is_active = 1
  `, [cid]);

  if (result.length > 0 && result[0].values.length > 0) {
    const row = result[0].values[0];
    return {
      id: row[0] as string,
      cid: row[1] as string,
      customer_name_emr: row[2] as string | null,
      customer_name_qb: row[3] as string | null
    };
  }

  return null;
}

/**
 * Create or update a customer from EMR data
 */
export function upsertCustomerFromEMR(
  db: Database,
  dbPath: string,
  cid: string,
  customerName?: string
): { id: string; isNew: boolean } {
  // Check if customer exists
  const existing = getCustomerByCID(db, cid);

  if (existing) {
    // Update name if provided and different
    if (customerName && customerName !== existing.customer_name_emr) {
      db.run(`
        UPDATE customers
        SET customer_name_emr = ?, updated_at = datetime('now')
        WHERE id = ?
      `, [customerName, existing.id]);
      saveDatabase(db, dbPath);
    }
    return { id: existing.id, isNew: false };
  }

  // Create new customer
  const id = uuidv4();
  db.run(`
    INSERT INTO customers (id, cid, customer_name_emr, emr_id, is_active)
    VALUES (?, ?, ?, ?, 1)
  `, [id, cid, customerName || null, cid]);

  logAudit(db, 'customer_created', 'customer', id, { cid, customerName });
  saveDatabase(db, dbPath);

  return { id, isNew: true };
}

/**
 * Get all customers with their mapping status
 */
export function getAllCustomersWithStatus(db: Database): any[] {
  const result = db.exec(`
    SELECT
      c.id,
      c.cid,
      c.customer_name_emr,
      c.emr_id,
      c.customer_name_qb,
      c.qb_list_id,
      c.is_active,
      c.created_at,
      (SELECT COUNT(*) FROM transactions_staging ts WHERE ts.customer_cid = c.cid) as transaction_count
    FROM customers c
    ORDER BY c.customer_name_emr, c.cid
  `);

  if (result.length === 0) return [];

  return result[0].values.map((row: any[]) => {
    const obj: any = {};
    result[0].columns.forEach((col: string, i: number) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

/**
 * Get unmapped customers (customers with transactions but no QB name)
 */
export function getUnmappedCustomers(db: Database): any[] {
  const result = db.exec(`
    SELECT DISTINCT
      ts.customer_cid as cid,
      c.customer_name_emr,
      c.customer_name_qb,
      COUNT(*) as transaction_count
    FROM transactions_staging ts
    LEFT JOIN customers c ON ts.customer_cid = c.cid
    WHERE c.customer_name_qb IS NULL OR c.customer_name_qb = ''
    GROUP BY ts.customer_cid, c.customer_name_emr, c.customer_name_qb
    ORDER BY transaction_count DESC
  `);

  if (result.length === 0) return [];

  return result[0].values.map((row: any[]) => {
    const obj: any = {};
    result[0].columns.forEach((col: string, i: number) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

/**
 * Update customer's QuickBooks name
 */
export function updateCustomerQBName(
  db: Database,
  dbPath: string,
  cid: string,
  qbName: string,
  qbListId?: string
): boolean {
  try {
    db.run(`
      UPDATE customers
      SET customer_name_qb = ?, qb_list_id = ?, updated_at = datetime('now')
      WHERE cid = ?
    `, [qbName, qbListId || null, cid]);

    logAudit(db, 'customer_qb_mapped', 'customer', cid, { qbName, qbListId });
    saveDatabase(db, dbPath);

    return true;
  } catch (error) {
    console.error('Error updating customer QB name:', error);
    return false;
  }
}

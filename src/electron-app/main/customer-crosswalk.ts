import { Database } from 'sql.js';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { saveDatabase, logAudit } from './database';

interface CrosswalkImportResult {
  success: boolean;
  customersImported: number;
  customerIdsImported: number;
  uuidsImported: number;
  qbCustomersImported: number;
  error?: string;
}

/**
 * Detect the table type from CSV column headers
 */
function detectCSVTableType(columns: string[]): string | null {
  const colSet = new Set(columns.map(c => c.toLowerCase()));

  if (colSet.has('uuid_v4')) return 'uuids_pool';
  if (colSet.has('customer_id') && colSet.has('system_name') && colSet.has('external_id')) return 'customer_ids';
  if (colSet.has('customer_id') && !colSet.has('system_name') && !colSet.has('qb_display_name')) return 'customers';
  if (colSet.has('qb_listid') || colSet.has('qb_display_name')) return 'stg_qb_customers';
  if (colSet.has('emr_patient_id') && (colSet.has('full_name') || colSet.has('first_name') || colSet.has('last_name'))) return 'stg_emr_patients';

  return null;
}

/**
 * Import customer crosswalk from Excel or CSV file
 * Excel: Handles multiple sheets (customers, customer_ids, uuids_pool, stg_qb_customers)
 * CSV: Auto-detects table type from column headers
 */
export function importCustomerCrosswalk(
  db: Database,
  dbPath: string,
  filePath: string
): CrosswalkImportResult {
  try {
    console.log(`Importing customer crosswalk from: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        customersImported: 0,
        customerIdsImported: 0,
        uuidsImported: 0,
        qbCustomersImported: 0,
        error: `File not found: ${filePath}`
      };
    }

    const fileBuffer = fs.readFileSync(filePath);
    const fileExt = path.extname(filePath).toLowerCase();
    const isCSV = fileExt === '.csv';

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    console.log('Available sheets:', workbook.SheetNames);
    console.log('File type:', isCSV ? 'CSV' : 'Excel');

    let customersImported = 0;
    let customerIdsImported = 0;
    let uuidsImported = 0;
    let qbCustomersImported = 0;

    // Handle CSV files - auto-detect table type from columns
    if (isCSV) {
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json<any>(sheet);

      if (data.length === 0) {
        return {
          success: false,
          customersImported: 0,
          customerIdsImported: 0,
          uuidsImported: 0,
          qbCustomersImported: 0,
          error: 'CSV file is empty'
        };
      }

      // Detect table type from column headers
      const columns = Object.keys(data[0]);
      const tableType = detectCSVTableType(columns);
      console.log(`CSV detected table type: ${tableType}, columns: ${columns.join(', ')}`);

      if (!tableType) {
        return {
          success: false,
          customersImported: 0,
          customerIdsImported: 0,
          uuidsImported: 0,
          qbCustomersImported: 0,
          error: `Could not detect table type from columns: ${columns.join(', ')}`
        };
      }

      // Process based on detected type
      switch (tableType) {
        case 'uuids_pool':
          for (const row of data) {
            const uuid = row['uuid_v4'];
            if (!uuid) continue;
            try {
              db.run(`INSERT OR IGNORE INTO uuids_pool (uuid_v4, is_available) VALUES (?, 1)`, [uuid]);
              uuidsImported++;
            } catch (e) { /* ignore duplicates */ }
          }
          console.log(`CSV: Imported ${uuidsImported} UUIDs`);
          break;

        case 'customers':
          for (const row of data) {
            const customerId = row['customer_id'];
            if (!customerId) continue;
            try {
              db.run(`INSERT OR IGNORE INTO customers (customer_id, created_at, status) VALUES (?, ?, ?)`,
                [customerId, row['created_at'] || new Date().toISOString(), row['status'] || 'active']);
              db.run(`UPDATE uuids_pool SET is_available = 0, assigned_at = datetime('now') WHERE uuid_v4 = ?`, [customerId]);
              customersImported++;
            } catch (e) { /* ignore duplicates */ }
          }
          console.log(`CSV: Imported ${customersImported} customers`);
          break;

        case 'customer_ids':
          for (const row of data) {
            const customerId = row['customer_id'];
            const systemName = row['system_name'];
            const externalId = String(row['external_id'] || '');
            if (!customerId || !systemName || !externalId) continue;
            try {
              db.run(`INSERT OR REPLACE INTO customer_ids (customer_id, system_name, external_id) VALUES (?, ?, ?)`,
                [customerId, systemName, externalId]);
              customerIdsImported++;
            } catch (e) { console.error('Error inserting customer_id:', e); }
          }
          console.log(`CSV: Imported ${customerIdsImported} customer ID mappings`);
          break;

        case 'stg_qb_customers':
          for (const row of data) {
            const qbListId = row['qb_listid'];
            const qbDisplayName = row['qb_display_name'];
            if (!qbListId || !qbDisplayName) continue;

            // Get customer_id from row - check both 'UUID' and 'customer_id' column names
            const customerId = row['UUID'] || row['uuid'] || row['customer_id'] || null;

            try {
              db.run(`INSERT OR REPLACE INTO stg_qb_customers (qb_listid, qb_display_name, email, phone, customer_id) VALUES (?, ?, ?, ?, ?)`,
                [qbListId, qbDisplayName, row['email'] || null, row['phone'] || null, customerId]);
              qbCustomersImported++;
            } catch (e) { console.error('Error inserting QB customer:', e); }
          }
          console.log(`CSV: Imported ${qbCustomersImported} QB customers`);
          break;

        case 'stg_emr_patients':
          let emrPatientsImported = 0;
          for (const row of data) {
            const emrPatientId = row['emr_patient_id'];
            if (!emrPatientId) continue;

            // Support full_name or first_name + last_name
            let fullName = row['full_name'];
            if (!fullName && (row['first_name'] || row['last_name'])) {
              fullName = [row['first_name'], row['last_name']].filter(Boolean).join(' ').trim();
            }

            const customerId = row['customer_id'] || row['UUID'] || row['uuid'] || null;

            try {
              db.run(`INSERT OR REPLACE INTO stg_emr_patients (emr_patient_id, full_name, customer_id) VALUES (?, ?, ?)`,
                [emrPatientId, fullName || null, customerId]);
              emrPatientsImported++;
            } catch (e) { console.error('Error inserting EMR patient:', e); }
          }
          console.log(`CSV: Imported ${emrPatientsImported} EMR patients`);
          break;
      }

      // Log and save for CSV
      logAudit(db, 'customer_crosswalk_imported', 'crosswalk', undefined, {
        fileType: 'csv',
        tableType,
        customersImported,
        customerIdsImported,
        uuidsImported,
        qbCustomersImported
      });
      saveDatabase(db, dbPath);

      return {
        success: true,
        customersImported,
        customerIdsImported,
        uuidsImported,
        qbCustomersImported
      };
    }

    // Excel file processing - check for named sheets
    // 1. Import UUIDs pool first
    if (workbook.SheetNames.includes('uuids_pool')) {
      const uuidsSheet = workbook.Sheets['uuids_pool'];
      const uuidsData = XLSX.utils.sheet_to_json<any>(uuidsSheet);

      console.log(`Found ${uuidsData.length} UUIDs to import`);

      for (const row of uuidsData) {
        const uuid = row['uuid_v4'];
        if (!uuid) continue;

        try {
          db.run(`
            INSERT OR IGNORE INTO uuids_pool (uuid_v4, is_available)
            VALUES (?, 1)
          `, [uuid]);
          uuidsImported++;
        } catch (e) {
          // Ignore duplicates
        }
      }
      console.log(`Imported ${uuidsImported} UUIDs to pool`);
    }

    // 2. Import customers master table
    if (workbook.SheetNames.includes('customers')) {
      const customersSheet = workbook.Sheets['customers'];
      const customersData = XLSX.utils.sheet_to_json<any>(customersSheet);

      console.log(`Found ${customersData.length} customers to import`);

      for (const row of customersData) {
        const customerId = row['customer_id'];
        if (!customerId) continue;

        try {
          db.run(`
            INSERT OR IGNORE INTO customers (customer_id, created_at, status)
            VALUES (?, ?, ?)
          `, [
            customerId,
            row['created_at'] || new Date().toISOString(),
            row['status'] || 'active'
          ]);

          // Mark UUID as used in pool
          db.run(`
            UPDATE uuids_pool SET is_available = 0, assigned_at = datetime('now')
            WHERE uuid_v4 = ?
          `, [customerId]);

          customersImported++;
        } catch (e) {
          // Ignore duplicates
        }
      }
      console.log(`Imported ${customersImported} customers`);
    }

    // 3. Import customer_ids mappings
    if (workbook.SheetNames.includes('customer_ids')) {
      const idsSheet = workbook.Sheets['customer_ids'];
      const idsData = XLSX.utils.sheet_to_json<any>(idsSheet);

      console.log(`Found ${idsData.length} customer ID mappings`);

      for (const row of idsData) {
        const customerId = row['customer_id'];
        const systemName = row['system_name'];
        const externalId = String(row['external_id'] || '');

        if (!customerId || !systemName || !externalId) continue;

        try {
          db.run(`
            INSERT OR REPLACE INTO customer_ids (customer_id, system_name, external_id)
            VALUES (?, ?, ?)
          `, [customerId, systemName, externalId]);
          customerIdsImported++;
        } catch (e) {
          console.error('Error inserting customer_id:', e);
        }
      }
      console.log(`Imported ${customerIdsImported} customer ID mappings`);
    }

    // 4. Import stg_qb_customers
    if (workbook.SheetNames.includes('stg_qb_customers')) {
      const qbSheet = workbook.Sheets['stg_qb_customers'];
      const qbData = XLSX.utils.sheet_to_json<any>(qbSheet);

      console.log(`Found ${qbData.length} QB customers to import`);

      for (const row of qbData) {
        const qbListId = row['qb_listid'];
        const qbDisplayName = row['qb_display_name'];

        if (!qbListId || !qbDisplayName) continue;

        // Get customer_id from row - check both 'UUID' and 'customer_id' column names
        const customerId = row['UUID'] || row['uuid'] || row['customer_id'] || null;

        try {
          db.run(`
            INSERT OR REPLACE INTO stg_qb_customers (qb_listid, qb_display_name, email, phone, customer_id)
            VALUES (?, ?, ?, ?, ?)
          `, [
            qbListId,
            qbDisplayName,
            row['email'] || null,
            row['phone'] || null,
            customerId
          ]);
          qbCustomersImported++;
        } catch (e) {
          console.error('Error inserting QB customer:', e);
        }
      }
      console.log(`Imported ${qbCustomersImported} QB customers`);
    }

    // 5. Import stg_emr_patients
    let emrPatientsImported = 0;
    if (workbook.SheetNames.includes('stg_emr_patients')) {
      const emrSheet = workbook.Sheets['stg_emr_patients'];
      const emrData = XLSX.utils.sheet_to_json<any>(emrSheet);

      console.log(`Found ${emrData.length} EMR patients to import`);

      for (const row of emrData) {
        const emrPatientId = row['emr_patient_id'];
        if (!emrPatientId) continue;

        // Support full_name or first_name + last_name
        let fullName = row['full_name'];
        if (!fullName && (row['first_name'] || row['last_name'])) {
          fullName = [row['first_name'], row['last_name']].filter(Boolean).join(' ').trim();
        }

        // Get customer_id from row
        const customerId = row['customer_id'] || row['UUID'] || row['uuid'] || null;

        try {
          db.run(`
            INSERT OR REPLACE INTO stg_emr_patients (emr_patient_id, full_name, customer_id)
            VALUES (?, ?, ?)
          `, [emrPatientId, fullName || null, customerId]);
          emrPatientsImported++;
        } catch (e) {
          console.error('Error inserting EMR patient:', e);
        }
      }
      console.log(`Imported ${emrPatientsImported} EMR patients`);
    }

    // Log the import
    logAudit(db, 'customer_crosswalk_imported', 'crosswalk', undefined, {
      customersImported,
      customerIdsImported,
      uuidsImported,
      qbCustomersImported
    });

    saveDatabase(db, dbPath);

    return {
      success: true,
      customersImported,
      customerIdsImported,
      uuidsImported,
      qbCustomersImported
    };
  } catch (error: any) {
    console.error('Error importing customer crosswalk:', error);
    return {
      success: false,
      customersImported: 0,
      customerIdsImported: 0,
      uuidsImported: 0,
      qbCustomersImported: 0,
      error: error.message
    };
  }
}

/**
 * Get customer UUID by EMR patient ID
 * If not found, assigns a new UUID from the pool and creates the mapping
 */
export function getOrCreateCustomerByEMRId(
  db: Database,
  dbPath: string,
  emrPatientId: string,
  patientName?: string
): { customerId: string; isNew: boolean } {
  // Normalize the EMR ID
  const normalizedEmrId = String(emrPatientId).trim();

  // Look up existing mapping
  const existingResult = db.exec(`
    SELECT customer_id FROM customer_ids
    WHERE system_name = 'EMR' AND external_id = ?
  `, [normalizedEmrId]);

  if (existingResult.length > 0 && existingResult[0].values.length > 0) {
    return {
      customerId: existingResult[0].values[0][0] as string,
      isNew: false
    };
  }

  // Get a UUID from the pool
  const uuidResult = db.exec(`
    SELECT uuid_v4 FROM uuids_pool
    WHERE is_available = 1
    LIMIT 1
  `);

  let newCustomerId: string;
  if (uuidResult.length > 0 && uuidResult[0].values.length > 0) {
    newCustomerId = uuidResult[0].values[0][0] as string;
    // Mark as used
    db.run(`
      UPDATE uuids_pool SET is_available = 0, assigned_at = datetime('now')
      WHERE uuid_v4 = ?
    `, [newCustomerId]);
  } else {
    // Generate a new UUID if pool is empty
    newCustomerId = uuidv4();
  }

  // Create customer record
  db.run(`
    INSERT INTO customers (customer_id, status)
    VALUES (?, 'active')
  `, [newCustomerId]);

  // Create EMR mapping
  db.run(`
    INSERT INTO customer_ids (customer_id, system_name, external_id)
    VALUES (?, 'EMR', ?)
  `, [newCustomerId, normalizedEmrId]);

  // Create EMR patient staging record if name provided
  if (patientName) {
    db.run(`
      INSERT OR REPLACE INTO stg_emr_patients (emr_patient_id, full_name, customer_id)
      VALUES (?, ?, ?)
    `, [normalizedEmrId, patientName, newCustomerId]);
  }

  logAudit(db, 'customer_created_from_emr', 'customer', newCustomerId, {
    emrPatientId: normalizedEmrId,
    patientName
  });

  saveDatabase(db, dbPath);

  return {
    customerId: newCustomerId,
    isNew: true
  };
}

/**
 * Get QB display name for a customer UUID
 */
export function getQBDisplayName(db: Database, customerId: string): string | null {
  // First try to get from stg_qb_customers via customer_id
  const directResult = db.exec(`
    SELECT qb_display_name FROM stg_qb_customers
    WHERE customer_id = ?
  `, [customerId]);

  if (directResult.length > 0 && directResult[0].values.length > 0) {
    return directResult[0].values[0][0] as string;
  }

  // Try via customer_ids QB mapping
  const qbIdResult = db.exec(`
    SELECT external_id FROM customer_ids
    WHERE customer_id = ? AND system_name = 'QuickBooks'
  `, [customerId]);

  if (qbIdResult.length > 0 && qbIdResult[0].values.length > 0) {
    const qbListId = qbIdResult[0].values[0][0] as string;

    const qbNameResult = db.exec(`
      SELECT qb_display_name FROM stg_qb_customers
      WHERE qb_listid = ?
    `, [qbListId]);

    if (qbNameResult.length > 0 && qbNameResult[0].values.length > 0) {
      return qbNameResult[0].values[0][0] as string;
    }
  }

  return null;
}

/**
 * Build lookup map: EMR patient ID -> Customer UUID
 */
export function buildEMRToCustomerMap(db: Database): Map<string, string> {
  const map = new Map<string, string>();

  const result = db.exec(`
    SELECT external_id, customer_id FROM customer_ids
    WHERE system_name = 'EMR'
  `);

  if (result.length > 0 && result[0].values) {
    for (const row of result[0].values) {
      map.set(String(row[0]), row[1] as string);
    }
  }

  return map;
}

/**
 * Build lookup map: Customer UUID -> QB display name
 */
export function buildCustomerToQBNameMap(db: Database): Map<string, string> {
  const map = new Map<string, string>();

  // Get all QB customers with linked customer_id
  const result = db.exec(`
    SELECT customer_id, qb_display_name FROM stg_qb_customers
    WHERE customer_id IS NOT NULL
  `);

  if (result.length > 0 && result[0].values) {
    for (const row of result[0].values) {
      map.set(row[0] as string, row[1] as string);
    }
  }

  // Also check customer_ids for QB mappings
  const qbMappings = db.exec(`
    SELECT ci.customer_id, qb.qb_display_name
    FROM customer_ids ci
    JOIN stg_qb_customers qb ON ci.external_id = qb.qb_listid
    WHERE ci.system_name = 'QuickBooks'
  `);

  if (qbMappings.length > 0 && qbMappings[0].values) {
    for (const row of qbMappings[0].values) {
      if (!map.has(row[0] as string)) {
        map.set(row[0] as string, row[1] as string);
      }
    }
  }

  return map;
}

/**
 * Get crosswalk stats
 */
export function getCrosswalkStats(db: Database): {
  totalCustomers: number;
  customersWithEMR: number;
  customersWithQB: number;
  availableUUIDs: number;
  unmappedEMRPatients: number;
} {
  const totalCustomers = db.exec(`SELECT COUNT(*) FROM customers`);
  const customersWithEMR = db.exec(`
    SELECT COUNT(DISTINCT customer_id) FROM customer_ids WHERE system_name = 'EMR'
  `);
  const customersWithQB = db.exec(`
    SELECT COUNT(DISTINCT customer_id) FROM customer_ids WHERE system_name = 'QuickBooks'
  `);
  const availableUUIDs = db.exec(`SELECT COUNT(*) FROM uuids_pool WHERE is_available = 1`);
  const unmappedEMRPatients = db.exec(`
    SELECT COUNT(DISTINCT ts.customer_cid)
    FROM transactions_staging ts
    LEFT JOIN customer_ids ci ON ci.external_id = ts.customer_cid AND ci.system_name = 'EMR'
    WHERE ci.customer_id IS NULL AND ts.customer_cid IS NOT NULL
  `);

  return {
    totalCustomers: totalCustomers[0]?.values[0]?.[0] as number || 0,
    customersWithEMR: customersWithEMR[0]?.values[0]?.[0] as number || 0,
    customersWithQB: customersWithQB[0]?.values[0]?.[0] as number || 0,
    availableUUIDs: availableUUIDs[0]?.values[0]?.[0] as number || 0,
    unmappedEMRPatients: unmappedEMRPatients[0]?.values[0]?.[0] as number || 0
  };
}

/**
 * Get all customers with their mappings
 * Handles variations in system_name: 'EMR', 'QB', 'QuickBooks', etc.
 */
export function getAllCustomersWithMappings(db: Database): any[] {
  const result = db.exec(`
    SELECT
      c.customer_id,
      c.status,
      c.created_at,
      emr.external_id as emr_patient_id,
      qb.external_id as qb_list_id,
      ep.full_name as emr_name,
      qbc.qb_display_name
    FROM customers c
    LEFT JOIN customer_ids emr ON c.customer_id = emr.customer_id AND (emr.system_name = 'EMR' OR emr.system_name LIKE '%EMR%')
    LEFT JOIN customer_ids qb ON c.customer_id = qb.customer_id AND (qb.system_name = 'QuickBooks' OR qb.system_name = 'QB' OR qb.system_name LIKE '%QB%')
    LEFT JOIN stg_emr_patients ep ON emr.external_id = ep.emr_patient_id
    LEFT JOIN stg_qb_customers qbc ON qb.external_id = qbc.qb_listid OR qbc.customer_id = c.customer_id
    ORDER BY c.created_at DESC
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
 * Get unmapped EMR patients from transactions
 */
export function getUnmappedEMRPatients(db: Database): any[] {
  const result = db.exec(`
    SELECT DISTINCT
      ts.customer_cid as emr_patient_id,
      COUNT(*) as transaction_count
    FROM transactions_staging ts
    LEFT JOIN customer_ids ci ON ci.external_id = ts.customer_cid AND ci.system_name = 'EMR'
    WHERE ci.customer_id IS NULL AND ts.customer_cid IS NOT NULL AND ts.customer_cid != ''
    GROUP BY ts.customer_cid
    ORDER BY transaction_count DESC
  `);

  if (result.length === 0) return [];

  return result[0].values.map((row: any[]) => ({
    emr_patient_id: row[0],
    transaction_count: row[1]
  }));
}

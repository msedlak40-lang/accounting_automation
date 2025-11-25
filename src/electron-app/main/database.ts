import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

let db: Database | null = null;

/**
 * Initialize SQL.js and create/load the database
 */
export async function initializeDatabase(dbPath: string): Promise<Database> {
  // Determine the correct path to sql.js WASM file
  // In dev mode, use the node_modules in the project directory
  // In production, use the packaged location
  let wasmPath: string;

  if (app.isPackaged) {
    // Production: WASM file is in resources
    wasmPath = path.join(process.resourcesPath, 'sql-wasm.wasm');
  } else {
    // Development: Use node_modules relative to the electron-app directory
    // __dirname in dev is typically: src/electron-app/dist-electron/main
    // We need: src/electron-app/node_modules/sql.js/dist/
    wasmPath = path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm');

    // If that doesn't exist, try from project root
    if (!fs.existsSync(wasmPath)) {
      wasmPath = path.join(app.getAppPath(), 'node_modules/sql.js/dist/sql-wasm.wasm');
    }
  }

  console.log('SQL.js WASM path:', wasmPath);
  console.log('WASM exists:', fs.existsSync(wasmPath));

  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  });

  // Check if database file exists
  if (fs.existsSync(dbPath)) {
    // Load existing database
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log('Loaded existing database from:', dbPath);
  } else {
    // Create new database
    db = new SQL.Database();
    console.log('Created new database');
  }

  // Create all tables
  createTables(db);

  // Save database to file
  saveDatabase(db, dbPath);

  return db;
}

/**
 * Save database to disk
 */
export function saveDatabase(database: Database, dbPath: string): void {
  const data = database.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

/**
 * Create all database tables
 */
function createTables(database: Database): void {
  const queries = `
    -- 1. Customers master table (UUID-based)
    CREATE TABLE IF NOT EXISTS customers (
      customer_id        TEXT PRIMARY KEY,
      created_at         TEXT DEFAULT (datetime('now')),
      status             TEXT DEFAULT 'active'
    );

    -- 2. Customer IDs mapping table (maps UUID to system-specific IDs)
    CREATE TABLE IF NOT EXISTS customer_ids (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id        TEXT NOT NULL REFERENCES customers(customer_id),
      system_name        TEXT NOT NULL,
      external_id        TEXT NOT NULL,
      created_at         TEXT DEFAULT (datetime('now')),
      UNIQUE(system_name, external_id)
    );

    CREATE INDEX IF NOT EXISTS idx_customer_ids_customer ON customer_ids(customer_id);
    CREATE INDEX IF NOT EXISTS idx_customer_ids_system ON customer_ids(system_name, external_id);

    -- 3. UUIDs pool table
    CREATE TABLE IF NOT EXISTS uuids_pool (
      uuid_v4            TEXT PRIMARY KEY,
      assigned_at        TEXT,
      is_available       INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_uuids_pool_available ON uuids_pool(is_available);

    -- 4. EMR patients staging table
    CREATE TABLE IF NOT EXISTS stg_emr_patients (
      emr_patient_id     TEXT PRIMARY KEY,
      full_name          TEXT,
      first_name         TEXT,
      last_name          TEXT,
      email              TEXT,
      phone              TEXT,
      dob                TEXT,
      customer_id        TEXT REFERENCES customers(customer_id),
      created_at         TEXT DEFAULT (datetime('now')),
      updated_at         TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_stg_emr_patients_customer ON stg_emr_patients(customer_id);

    -- 5. QB customers staging table
    CREATE TABLE IF NOT EXISTS stg_qb_customers (
      qb_listid          TEXT PRIMARY KEY,
      qb_display_name    TEXT NOT NULL,
      email              TEXT,
      phone              TEXT,
      customer_id        TEXT REFERENCES customers(customer_id),
      created_at         TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_stg_qb_customers_customer ON stg_qb_customers(customer_id);
    CREATE INDEX IF NOT EXISTS idx_stg_qb_customers_display_name ON stg_qb_customers(qb_display_name);

    -- 6. Service mappings table
    CREATE TABLE IF NOT EXISTS service_mappings (
      id                 TEXT PRIMARY KEY,
      emr_service_name   TEXT NOT NULL UNIQUE,
      qb_item_name       TEXT NOT NULL,
      qb_item_hierarchy  TEXT,
      asset_account      TEXT,
      income_account     TEXT NOT NULL,
      tax_code           TEXT,
      is_active          INTEGER DEFAULT 1,
      created_at         TEXT DEFAULT (datetime('now')),
      updated_at         TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_service_mappings_emr_service ON service_mappings(emr_service_name);
    CREATE INDEX IF NOT EXISTS idx_service_mappings_active ON service_mappings(is_active);

    -- 7. Payment type mappings table
    CREATE TABLE IF NOT EXISTS payment_type_mappings (
      id                 TEXT PRIMARY KEY,
      payment_type       TEXT UNIQUE NOT NULL,
      category           TEXT NOT NULL,
      clearing_account   TEXT NOT NULL,
      is_active          INTEGER DEFAULT 1,
      created_at         TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_payment_type ON payment_type_mappings(payment_type);

    -- 8. File uploads table
    CREATE TABLE IF NOT EXISTS file_uploads (
      id                 TEXT PRIMARY KEY,
      filename           TEXT NOT NULL,
      file_type          TEXT NOT NULL,
      row_count          INTEGER,
      uploaded_at        TEXT DEFAULT (datetime('now')),
      processed_at       TEXT,
      status             TEXT,
      user_id            TEXT DEFAULT 'primary_user'
    );

    CREATE INDEX IF NOT EXISTS idx_file_uploads_type ON file_uploads(file_type);
    CREATE INDEX IF NOT EXISTS idx_file_uploads_uploaded_at ON file_uploads(uploaded_at);

    -- 9. Transactions staging table
    CREATE TABLE IF NOT EXISTS transactions_staging (
      id                 TEXT PRIMARY KEY,
      upload_id          TEXT REFERENCES file_uploads(id),
      customer_cid       TEXT,
      customer_id        TEXT REFERENCES customers(customer_id),
      invoice_number     TEXT,
      transaction_date   TEXT,
      service_name       TEXT,
      quantity           REAL,
      price              REAL,
      amount             REAL,
      payment_type       TEXT,
      transaction_data   TEXT,
      mapped_data        TEXT,
      needs_review       INTEGER DEFAULT 0,
      potential_matches  TEXT,
      created_at         TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_staging_upload_id ON transactions_staging(upload_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_staging_customer_cid ON transactions_staging(customer_cid);
    CREATE INDEX IF NOT EXISTS idx_transactions_staging_customer_id ON transactions_staging(customer_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_staging_date ON transactions_staging(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_staging_needs_review ON transactions_staging(needs_review);

    -- 10. Expense categories table
    CREATE TABLE IF NOT EXISTS expense_categories (
      id                 TEXT PRIMARY KEY,
      merchant_pattern   TEXT NOT NULL,
      category_name      TEXT NOT NULL,
      expense_account    TEXT NOT NULL,
      is_cogs            INTEGER DEFAULT 0,
      is_active          INTEGER DEFAULT 1,
      created_at         TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_expense_categories_pattern ON expense_categories(merchant_pattern);
    CREATE INDEX IF NOT EXISTS idx_expense_categories_active ON expense_categories(is_active);

    -- 11. Expense transactions table
    CREATE TABLE IF NOT EXISTS expense_transactions (
      id                 TEXT PRIMARY KEY,
      upload_id          TEXT REFERENCES file_uploads(id),
      transaction_date   TEXT,
      posted_date        TEXT,
      card_last_four     TEXT,
      merchant           TEXT,
      capital_one_category TEXT,
      amount             REAL,
      category_id        TEXT REFERENCES expense_categories(id),
      expense_account    TEXT,
      memo               TEXT,
      status             TEXT,
      transaction_data   TEXT,
      created_at         TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_expense_transactions_upload_id ON expense_transactions(upload_id);
    CREATE INDEX IF NOT EXISTS idx_expense_transactions_date ON expense_transactions(transaction_date);
    CREATE INDEX IF NOT EXISTS idx_expense_transactions_merchant ON expense_transactions(merchant);
    CREATE INDEX IF NOT EXISTS idx_expense_transactions_status ON expense_transactions(status);

    -- 12. Audit log table
    CREATE TABLE IF NOT EXISTS audit_log (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp          TEXT DEFAULT (datetime('now')),
      action             TEXT NOT NULL,
      entity_type        TEXT,
      entity_id          TEXT,
      details            TEXT,
      user_id            TEXT DEFAULT 'primary_user'
    );

    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
  `;

  // Execute all CREATE TABLE statements
  database.exec(queries);
  console.log('Database schema initialized successfully');
}

/**
 * Log an action to the audit trail
 */
export function logAudit(
  database: Database,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: any
): void {
  database.run(
    `INSERT INTO audit_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)`,
    [
      action,
      entityType || null,
      entityId || null,
      details ? JSON.stringify(details) : null,
    ]
  );
}

export { Database };

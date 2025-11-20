import Database from 'better-sqlite3';

/**
 * Initialize the SQLite database schema
 * Creates all tables if they don't exist
 */
export function initializeDatabase(db: Database.Database): void {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create all tables
  createCustomersTable(db);
  createCustomerHistoryTable(db);
  createServiceMappingsTable(db);
  createPaymentTypeMappingsTable(db);
  createFileUploadsTable(db);
  createTransactionsStagingTable(db);
  createExpenseCategoriesTable(db);
  createExpenseTransactionsTable(db);
  createAuditLogTable(db);

  console.log('Database schema initialized successfully');
}

function createCustomersTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id                 TEXT PRIMARY KEY,
      cid                TEXT UNIQUE NOT NULL,
      customer_name_emr  TEXT,
      emr_id             TEXT,
      customer_name_qb   TEXT,
      qb_list_id         TEXT,
      is_active          INTEGER DEFAULT 1,
      created_at         TEXT DEFAULT (datetime('now')),
      updated_at         TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_customers_cid ON customers(cid);
    CREATE INDEX IF NOT EXISTS idx_customers_emr_id ON customers(emr_id);
  `);
}

function createCustomerHistoryTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customer_history (
      id                 TEXT PRIMARY KEY,
      customer_id        TEXT REFERENCES customers(id),
      cid                TEXT,
      customer_name_emr  TEXT,
      emr_id             TEXT,
      customer_name_qb   TEXT,
      qb_list_id         TEXT,
      change_type        TEXT,
      changed_at         TEXT DEFAULT (datetime('now')),
      changed_by         TEXT DEFAULT 'primary_user',
      snapshot           TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_customer_history_customer_id ON customer_history(customer_id);
    CREATE INDEX IF NOT EXISTS idx_customer_history_changed_at ON customer_history(changed_at);
  `);
}

function createServiceMappingsTable(db: Database.Database): void {
  db.exec(`
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
  `);
}

function createPaymentTypeMappingsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_type_mappings (
      id                 TEXT PRIMARY KEY,
      payment_type       TEXT UNIQUE NOT NULL,
      category           TEXT NOT NULL,
      clearing_account   TEXT NOT NULL,
      is_active          INTEGER DEFAULT 1,
      created_at         TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_payment_type ON payment_type_mappings(payment_type);
  `);
}

function createFileUploadsTable(db: Database.Database): void {
  db.exec(`
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
  `);
}

function createTransactionsStagingTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions_staging (
      id                 TEXT PRIMARY KEY,
      upload_id          TEXT REFERENCES file_uploads(id),
      customer_cid       TEXT,
      invoice_number     TEXT,
      transaction_date   TEXT,
      service_name       TEXT,
      quantity           REAL,
      price              REAL,
      amount             REAL,
      payment_type       TEXT,
      transaction_data   TEXT,
      mapped_data        TEXT,
      created_at         TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_staging_upload_id ON transactions_staging(upload_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_staging_customer_cid ON transactions_staging(customer_cid);
    CREATE INDEX IF NOT EXISTS idx_transactions_staging_date ON transactions_staging(transaction_date);
  `);
}

function createExpenseCategoriesTable(db: Database.Database): void {
  db.exec(`
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
  `);
}

function createExpenseTransactionsTable(db: Database.Database): void {
  db.exec(`
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
  `);
}

function createAuditLogTable(db: Database.Database): void {
  db.exec(`
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
  `);
}

/**
 * Log an action to the audit trail
 */
export function logAudit(
  db: Database.Database,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: any
): void {
  const stmt = db.prepare(`
    INSERT INTO audit_log (action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?)
  `);

  stmt.run(
    action,
    entityType || null,
    entityId || null,
    details ? JSON.stringify(details) : null
  );
}

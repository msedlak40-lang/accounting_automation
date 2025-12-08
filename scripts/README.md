# Database Seeding Scripts

## Overview

This directory contains scripts for seeding the accounting database with initial data from Excel files.

## seed-mappings.py

Seeds the database with service mappings and payment type mappings from `COA_Quickbooks_matched.xlsx`.

### Usage

**Create new database and seed:**
```bash
python3 scripts/seed-mappings.py --create
```

**Seed existing database:**
```bash
python3 scripts/seed-mappings.py
```

**Seed custom database location:**
```bash
python3 scripts/seed-mappings.py --db /path/to/accounting.db
```

### What it does

1. **Service Mappings** (115 entries)
   - Maps EMR service/product names → QuickBooks items
   - Includes asset accounts, income accounts, and tax codes
   - Examples:
     - `Dysport` → `Injectables:Dysport per Unit`
     - `Botox` → `Injectables:Botox per Unit`
     - `Growth Factor Eye Serum 15ML` → `Retail Skincare:Growth Factor Eye Serum 15ml`

2. **Payment Type Mappings** (12 entries)
   - Maps payment types → clearing accounts
   - Categories: `credit_card`, `vendor_receivable`, `financing`, `cash`, `check`, `gift_card`, `loyalty`
   - Examples:
     - `Visa/Amex/MasterCard/Discover` → `1030 · Merchant Clearing`
     - `Alle Rewards` → `1200 · Accounts Receivable:1220 · Vendor Receivables:Allē Rewards`
     - `Cash` → `1010 · Cash - Operating`
     - `Check` → `1020 · Undeposited Funds`

### Requirements

- Python 3.x
- openpyxl: `pip3 install openpyxl`

### Excel File Structure

The script expects `data/raw/COA_Quickbooks_matched.xlsx` with these sheets:

**emr_service_items sheet:**
| Column | Description |
|--------|-------------|
| Service/Product | EMR service/product name |
| Matched_Item | QuickBooks item name (with hierarchy) |
| Asset Account | Asset/inventory account (optional) |
| Account | Income account |
| Tax Code | Tax code (Tax/Non) |

**emr_payment_types sheet:**
| Column | Description |
|--------|-------------|
| Payment Type | Payment type name |
| desc | Description (e.g., "customer paid", "vendor receivable") |

### Database Schema

**service_mappings:**
```sql
CREATE TABLE service_mappings (
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
```

**payment_type_mappings:**
```sql
CREATE TABLE payment_type_mappings (
  id                 TEXT PRIMARY KEY,
  payment_type       TEXT UNIQUE NOT NULL,
  category           TEXT NOT NULL,
  clearing_account   TEXT NOT NULL,
  is_active          INTEGER DEFAULT 1,
  created_at         TEXT DEFAULT (datetime('now'))
);
```

### Verification

After seeding, verify the data:

```bash
python3 -c "
import sqlite3
conn = sqlite3.connect('src/electron-app/accounting.db')
c = conn.cursor()
print('Services:', c.execute('SELECT COUNT(*) FROM service_mappings').fetchone()[0])
print('Payments:', c.execute('SELECT COUNT(*) FROM payment_type_mappings').fetchone()[0])
conn.close()
"
```

Expected output:
```
Services: 115
Payments: 12
```

## Notes

- The script will **clear existing data** before inserting new records
- Each run logs an audit entry in the `audit_log` table
- UUIDs are automatically generated for each record
- The script can create the database schema if it doesn't exist (use `--create` flag)

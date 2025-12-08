# Database Seeding Scripts

## Overview

This directory contains scripts for seeding and inspecting the accounting database. The Electron app stores its database in the user's AppData directory (not in the project folder), which is standard practice for desktop applications.

## Database Locations by Platform

- **Windows**: `C:\Users\{Username}\AppData\Roaming\medspa-accounting-automation\accounting.db`
- **macOS**: `~/Library/Application Support/medspa-accounting-automation/accounting.db`
- **Linux**: `~/.config/medspa-accounting-automation/accounting.db`

## Scripts

### seed-mappings.js (Node.js - Current)

**⭐ Recommended** - Seeds the database using Node.js with no Python dependency.

#### Usage

```bash
npm run seed:mappings
```

#### What it does

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

#### Expected Output

```
🌱 Starting database seeding...

📁 Database path: C:\Users\{Username}\AppData\Roaming\medspa-accounting-automation\accounting.db
📊 Excel path: C:\Users\{Username}\accounting_automation\data\raw\COA_Quickbooks_matched.xlsx

📊 Reading Excel file...
  ✓ Found 115 service mappings
  ✓ Found 12 payment types

🗑️  Clearing existing mappings...
  ✓ Cleared

📥 Inserting service mappings...
  ✓ Inserted 115 service mappings

📥 Inserting payment type mappings...
  ✓ Inserted 12 payment type mappings

💾 Saving database...
  ✓ Saved

✅ Seeding complete!
   📊 115 service mappings
   💳 12 payment type mappings
```

#### Requirements

- Node.js 16+
- npm dependencies (auto-installed with `npm install`):
  - `sql.js` - SQLite database engine
  - `uuid` - UUID generation
  - `xlsx` - Excel file parsing

### seed-mappings.py (Python - Legacy)

**⚠️ Deprecated** - Use the Node.js version instead.

Old Python-based seeder. Requires Python 3 and openpyxl. Kept for reference but not maintained.

### inspect-excel.js

Utility script to inspect the structure and contents of the Excel file.

#### Usage

```bash
npm run inspect:excel
```

## Excel File Structure

The seed script reads from `data/raw/COA_Quickbooks_matched.xlsx` with these sheets:

### emr_service_items sheet

| Column | Description |
|--------|-------------|
| Service/Product | EMR service/product name |
| Matched_Item | QuickBooks item name (with hierarchy) |
| Asset Account | Asset/inventory account (optional) |
| Account | Income account |
| Tax Code | Tax code (Tax/Non) |

### emr_payment_types sheet

| Column | Description |
|--------|-------------|
| Payment Type | Payment type name |
| desc | Description (e.g., "customer paid", "vendor receivable") |

## Database Schema

### service_mappings

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

### payment_type_mappings

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

## Troubleshooting

### ❌ Issue: "0 mappings present" in the app

**Cause:** The database wasn't seeded, or was seeded to the wrong location.

**Solution:**
1. Run `npm install` in the root directory
2. Run `npm run seed:mappings`
3. Verify the output shows the correct AppData path
4. **Restart the Electron app** (critical - the app caches data in memory)

### ❌ Issue: "Python was not found"

**Cause:** Old version of the script tried to use Python for Excel parsing.

**Solution:**
```bash
git pull
npm install
npm run seed:mappings
```

The current version uses Node.js `xlsx` package instead of Python.

### ❌ Issue: "Database not found"

**Cause:** The app hasn't been run yet to create the initial database.

**Solution:** Start the Electron app at least once before running the seed script. The app creates the database file and schema on first launch.

### ❌ Issue: Seed script seeded wrong database

**Cause:** Old seed script was seeding `src/electron-app/accounting.db` instead of AppData.

**Solution:** The current seed script automatically detects the correct AppData path using the same logic as the Electron app. Just run `npm run seed:mappings` and it will seed the correct location.

### ❌ Issue: Changes not appearing after seeding

**Cause:** The Electron app caches data in memory and doesn't automatically reload.

**Solution:** Always restart the Electron app after running the seed script.

## Verification

After seeding, verify the data is present:

### In the App UI

1. Go to the **Services** tab → should show **115 mappings**
2. Go to the **Payments** tab → should show **12 payment types**

### In Browser Console (F12 in the app)

```javascript
// Check service mappings
window.electronAPI.serviceMappings.getAll().then(result => {
  console.log('Service Mappings:', result.data.length);
});

// Check payment types
window.electronAPI.paymentTypes.getAll().then(result => {
  console.log('Payment Types:', result.data.length);
});
```

Expected output:
```
Service Mappings: 115
Payment Types: 12
```

## Re-seeding

The seed script **clears existing mappings** before inserting new ones, so it's safe to run multiple times. This is useful when:
- The Excel file has been updated with new mappings
- You need to reset the mappings to a clean state
- You're testing different mapping configurations

Each run creates an audit log entry in the `audit_log` table with the seeding details.

## Technical Details

### Database Path Resolution

The seed script uses the same path resolution logic as the Electron app:

```javascript
function getUserDataPath() {
  const appName = 'medspa-accounting-automation';
  const homedir = os.homedir();

  switch (process.platform) {
    case 'win32':
      return path.join(process.env.APPDATA || path.join(homedir, 'AppData', 'Roaming'), appName);
    case 'darwin':
      return path.join(homedir, 'Library', 'Application Support', appName);
    case 'linux':
      return path.join(process.env.XDG_CONFIG_HOME || path.join(homedir, '.config'), appName);
    default:
      return path.join(homedir, '.config', appName);
  }
}
```

This ensures the seed script always targets the same database that the app uses.

### Why AppData?

Desktop applications store user data in AppData (Windows), Application Support (macOS), or .config (Linux) for several reasons:

1. **Persistence** - Data survives app updates and reinstalls
2. **Permissions** - Users always have write access to their AppData
3. **Separation** - Keeps user data separate from application code
4. **Standards** - Follows platform conventions for desktop apps

## Notes

- The script clears existing data before inserting to avoid duplicates
- Each run logs an audit entry in the `audit_log` table
- UUIDs are automatically generated for each record
- The database schema is created by the Electron app on first launch

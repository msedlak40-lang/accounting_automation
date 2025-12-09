// Simple script to check invoice #00039890
const fs = require('fs');

// Read the database file
const dbPath = './accounting.db';
if (!fs.existsSync(dbPath)) {
  console.error('Database not found at:', dbPath);
  process.exit(1);
}

// We'll use the sql.js library that should be in node_modules after npm install
// But for now, let's just output the SQL queries that need to be run

console.log(`
=====================================================
DEBUG QUERIES FOR INVOICE #00039890
=====================================================

Please run these queries in your Electron app's developer console
or use a SQL viewer to examine the accounting.db file.

The queries are saved in: debug_invoice_00039890.sql

KEY THINGS TO CHECK:
--------------------

1. Does a payment line exist in stg_emr_payments for invoice #00039890?
   - If NO, that's the problem! The matching query starts from stg_emr_payments.
   - The EMR file should have a payment line (with Payment Type = Visa/MC/etc)

2. Do service lines exist in transactions_staging for invoice #00039890?
   - These should have the "Total Due" values in the JSON transaction_data field

3. What is the sum of Total Due values for this invoice?
   - It should equal $387.05

4. Does the invoice_number match exactly?
   - Check if it's stored as "00039890" or "39890" (with/without leading zeros)

MOST LIKELY ISSUE:
-----------------
The EMR file probably has:
- 3 SERVICE lines (with Total Due values) for invoice #00039890
- But NO PAYMENT line (with Payment Type) for this invoice

If that's the case, there's nothing in stg_emr_payments to match against,
so the JOIN returns 0 rows.

FIX:
----
We need to change the matching logic to work differently:
- Instead of starting from stg_emr_payments (payment lines)
- We should group transactions_staging (service lines) by invoice
- And match those invoice totals against Gravity payments
- THEN link back to payment info if needed

`);

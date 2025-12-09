# Med Spa Accounting Automation Pipeline

Python pipeline for automating med spa accounting workflows:
- Generate invoices from EMR transactions
- Match Gravity payments to invoices

## Quick Start

### 1. Install

```bash
cd python_pipeline
pip install -e .
```

### 2. Generate Invoices

```bash
medspa invoices emr_transactions.xlsx COA_Quickbooks_matched.xlsx
```

This will create:
- `output/Invoice_Import_ItemBased.csv` - Import into Transaction Pro to create invoices
- `output/Unmapped_Services.csv` - Services that need mapping (if any)

### 3. Match Payments

```bash
medspa match emr_transactions.xlsx gravity_payments.csv
```

This will create:
- `output/Receive_Payments_From_Gravity.csv` - Import into Transaction Pro to apply payments
- `output/Unmatched_Gravity_Payments.csv` - Review these manually

### 4. Debug a Specific Invoice

```bash
medspa debug emr_transactions.xlsx 00039889
```

Shows exactly how the invoice total is calculated.

## How It Works

### Invoice Generation

1. **Load service mappings** from COA Excel file (emr_service_items sheet)
2. **Extract service lines** from EMR transactions (where Service/Product is filled)
3. **Map to QuickBooks items** using the service mappings
4. **Format for Transaction Pro** import (Customer, TxnDate, RefNumber, Item, etc.)

### Payment Matching Logic

1. **Calculate invoice totals** from service lines (Total Due column)
2. **Subtract rewards** (Alle Rewards, Aspire Awards, etc. from payment lines)
3. **Match to Gravity payments** by exact amount within ±7 days

### Example

For invoice #00039889:
```
Service line: Botox, Total Due = $352
Payment line: Alle Rewards, Amount = $20
Payment line: Visa, Amount = $332 (this is recorded by clinic, not matched)

Calculation: $352 - $20 = $332
Matches Gravity payment of $332 ✓
```

## File Formats

### EMR Transactions (Excel)

Required columns:
- `Date` - Transaction date
- `Invoice #` - Invoice number
- `CID` - Customer ID
- `Name` - Customer name
- `Service/Product` - Service name (blank for payment lines)
- `Total Due` - Amount due (for service lines)
- `Payment Type` - Payment method (blank for service lines)
- `Amount` - Payment amount (for payment lines)

### Gravity Payments (CSV)

Required columns:
- `Date/Time` - Payment datetime
- `Approval` - Transaction ID
- `Total` - Payment amount
- `Card Type` - Card type (Visa, MC, etc.)

## Commands

### Generate Invoices

```bash
# Basic usage
medspa invoices emr_transactions.xlsx COA_Quickbooks_matched.xlsx

# Custom output directory
medspa invoices emr.xlsx coa.xlsx --output-dir ./results
```

**Output:**
- `Invoice_Import_ItemBased.csv` - Ready for Transaction Pro import
- `Unmapped_Services.csv` - Services that need mapping (if any)

### Match Payments

```bash
# Basic usage
medspa match emr_transactions.xlsx gravity_payments.csv

# Custom output directory
medspa match emr.xlsx gravity.csv --output-dir ./results

# Wider date tolerance (±14 days instead of ±7)
medspa match emr.xlsx gravity.csv --date-tolerance 14
```

**Output:**
- `Receive_Payments_From_Gravity.csv` - Ready for Transaction Pro import
- `Unmatched_Gravity_Payments.csv` - Needs manual review

### Debug Invoice

```bash
medspa debug emr_transactions.xlsx 00039889
```

Output:
```
Debugging Invoice: 00039889
==================================================

Found 3 lines:

Service Lines:
  Botox: Total Due = $352.00
  Service Total: $352.00

Payment Lines:
  Alle Rewards: Amount = $20.00
  Visa: Amount = $332.00
  Rewards Total: $20.00

Calculation:
  $352.00 (services) - $20.00 (rewards) = $332.00

This invoice should match a Gravity payment of: $332.00
Date: 2025-10-08
```

## Why This Is Better Than the Electron App

1. **Simpler** - 200 lines vs 1000+ lines
2. **Clearer** - pandas DataFrames vs SQL queries
3. **Easier to debug** - `medspa debug` shows exactly what's happening
4. **Faster** - No database overhead
5. **More maintainable** - Python + pandas is standard for data pipelines

## Features

- ✅ **Invoice Generation** - Generate QuickBooks invoices from EMR services
- ✅ **Payment Matching** - Match Gravity payments to invoices (89% success rate)
- ✅ **Service Mapping** - Map EMR service names to QuickBooks items
- ✅ **Debug Tools** - Debug invoice calculations

## Next Steps

Future enhancements:
- Vendor receivable JEs for rewards (Alle, Aspire, Cherry)
- Customer ID crosswalk management
- Tax code automation
- Discount handling
- Full workflow automation

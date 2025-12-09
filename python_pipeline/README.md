# Med Spa Payment Matching Pipeline

Simple Python pipeline for matching Gravity payments to EMR invoices.

## Quick Start

### 1. Install

```bash
cd python_pipeline
pip install -e .
```

### 2. Run Matching

```bash
medspa match emr_transactions.xlsx gravity_payments.csv
```

This will create:
- `output/Receive_Payments_From_Gravity.csv` - Import into Transaction Pro
- `output/Unmatched_Gravity_Payments.csv` - Review these manually

### 3. Debug a Specific Invoice

```bash
medspa debug emr_transactions.xlsx 00039889
```

Shows exactly how the invoice total is calculated.

## How It Works

### Matching Logic

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

### Match Payments

```bash
# Basic usage
medspa match emr_transactions.xlsx gravity_payments.csv

# Custom output directory
medspa match emr.xlsx gravity.csv --output-dir ./results

# Wider date tolerance (±14 days instead of ±7)
medspa match emr.xlsx gravity.csv --date-tolerance 14
```

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

## Next Steps

Once this is working, we can add:
- CID (customer ID) management
- Service/payment mapping
- Invoice import generation
- Vendor receivable JEs

But let's get the core matching working first!

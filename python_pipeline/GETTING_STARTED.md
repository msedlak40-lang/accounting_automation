# Getting Started with the Med Spa Payment Matching Pipeline

## What This Does

This Python pipeline matches Gravity credit card payments to EMR invoices by:
1. Calculating invoice totals from service lines (Total Due)
2. Subtracting reward payments (Alle Rewards, Aspire Awards, etc.)
3. Matching the net amount to Gravity payments within ±7 days

**Example:**
- Service: Botox, Total Due = $352
- Alle Rewards: $20
- **Net = $332** → Matches Gravity payment of $332 ✓

## Setup (One-Time)

### Prerequisites
- Python 3.9 or higher
- pip (Python package installer)

### Installation

```powershell
# 1. Navigate to the repo
cd C:\Users\Trader\accounting_automation

# 2. Pull latest code
git pull origin claude/explore-codebase-015nsypKdhGzsgvhhUhRNZck

# 3. Install the pipeline
pip install -e python_pipeline
```

**Verify installation:**
```powershell
medspa --help
```

You should see:
```
Usage: medspa [OPTIONS] COMMAND [ARGS]...

Commands:
  match     Match Gravity payments to EMR invoices.
  invoices  Generate invoice import CSV for QuickBooks Transaction Pro.
  debug     Debug a specific invoice to see how it's being calculated.
```

## Running the Pipeline

### Basic Usage

```powershell
medspa match <emr_file> <gravity_file>
```

### With Your Files

```powershell
# From the repo root directory
cd C:\Users\Trader\accounting_automation

# Run matching
medspa match `
  data\raw\emr_transactions.xlsx `
  data\raw\gravity_payments.csv `
  --output-dir output

# Open results folder
explorer output
```

### Output Files

After running, you'll get two CSV files in the `output` folder:

1. **Receive_Payments_From_Gravity.csv**
   - Import this into QuickBooks via Transaction Pro
   - Contains matched payments with invoice references
   - Format: Customer, TxnDate, RefNumber, Amount, PaymentMethod, ApplyToRefNumber

2. **Unmatched_Gravity_Payments.csv**
   - Payments that couldn't be automatically matched
   - Review these manually
   - Format: Date, TransactionID, Amount, CardType

### Console Output

The command shows:
```
Invoice Summary:
  Total invoices: 761
  Invoices with rewards: 284
  Date range: 2025-01-03 to 2025-10-08

Matching Results:
  Gravity payments: 440
  Matched: 392 (89%)
  Unmatched: 48
    High confidence: 337
    Medium confidence: 55
```

## Debugging a Specific Invoice

If a payment didn't match, you can debug why:

```powershell
medspa debug data\raw\emr_transactions.xlsx 00039889
```

**Output:**
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

This shows you:
- What service lines exist
- What payment/reward lines exist
- The exact calculation
- What Gravity payment amount to look for

## Command Options

### Match Command

```powershell
medspa match [OPTIONS] EMR_FILE GRAVITY_FILE
```

**Options:**
- `--output-dir PATH` - Where to save results (default: ./output)
- `--date-tolerance N` - Days ± to search for matches (default: 7)

**Examples:**

```powershell
# Save to Desktop
medspa match data\raw\emr.xlsx data\raw\gravity.csv --output-dir C:\Users\Trader\Desktop\results

# Wider date window (±14 days instead of ±7)
medspa match data\raw\emr.xlsx data\raw\gravity.csv --date-tolerance 14

# Both options together
medspa match data\raw\emr.xlsx data\raw\gravity.csv --output-dir C:\temp --date-tolerance 10
```

## File Requirements

### EMR Transactions File (Excel)

**Required columns:**
- `Date` - Transaction date
- `Invoice #` - Invoice number
- `CID` - Customer ID
- `Service/Product` - Service name (blank for payment lines)
- `Total Due` - Amount due (for service lines only)
- `Payment Type` - Payment type (blank for service lines)
- `Amount` - Payment amount (for payment lines only)

**Structure example:**
| Date | Invoice # | CID | Service/Product | Total Due | Payment Type | Amount |
|------|-----------|-----|----------------|-----------|--------------|--------|
| 10/8/25 | 00039889 | 14681 | Botox | 352.00 | | 0.00 |
| 10/8/25 | 00039889 | 14681 | | 0.00 | Alle Rewards | 20.00 |
| 10/8/25 | 00039889 | 14681 | | 0.00 | Visa | 332.00 |

### Gravity Payments File (CSV)

**Required columns:**
- `Date/Time` - Payment datetime
- `Approval` - Transaction ID
- `Total` - Payment amount
- `Card Type` - Card type (VS, MC, AX, etc.)

## How the Matching Works

### Step 1: Group Service Lines by Invoice
```
Invoice #00039889:
  Botox: $352.00
  Total: $352.00
```

### Step 2: Find Reward Payments
```
Invoice #00039889:
  Alle Rewards: $20.00
```

### Step 3: Calculate Net Amount
```
$352.00 - $20.00 = $332.00
```

### Step 4: Match to Gravity Payment
```
Looking for Gravity payment of $332.00 on 10/8/25 (±7 days)
Found: Transaction 09868D, $332.00, 10/8/25 ✓
Match confidence: HIGH
```

### Confidence Levels

- **High confidence** - Exact amount match, same day or within 3 days
- **Medium confidence** - Exact amount match, 4-7 days apart or multiple candidates
- **Low** - Exact amount match, more than 7 days apart

## Generating Invoices

### What This Does

The invoice generation command creates a CSV file of all services performed, ready to import into QuickBooks via Transaction Pro. This creates the invoices for the services (not the payments - that's handled by the `match` command).

### Basic Usage

```powershell
medspa invoices <emr_file> <coa_file>
```

### With Your Files

```powershell
# From the repo root directory
cd C:\Users\Trader\accounting_automation

# Generate invoices
medspa invoices `
  data\raw\emr_transactions.xlsx `
  data\raw\COA_Quickbooks_matched.xlsx `
  --output-dir output

# Open results folder
explorer output
```

### Output Files

After running, you'll get these files in the `output` folder:

1. **Invoice_Import_ItemBased.csv**
   - Import this into QuickBooks via Transaction Pro
   - Contains all service lines with mapped QuickBooks items
   - Format: Customer, TxnDate, RefNumber, Item, Description, Quantity, Rate, Amount, TaxCode, Memo

2. **Unmapped_Services.csv** (if any services need mapping)
   - Services that don't have a mapping in the COA file
   - Add these to the `emr_service_items` sheet in COA_Quickbooks_matched.xlsx
   - Then re-run the invoice generation

### Console Output

The command shows:
```
Invoice Generation Summary:
  Total service lines: 1208
  Unique invoices: 756
  Date range: 2025-01-03 to 2025-10-08
  ⚠️  Unmapped services: 10
  ✓ Generated 1208 invoice lines
  ✓ Covering 756 invoices
```

### Adding Service Mappings

If you get unmapped services:

1. Open `data\raw\COA_Quickbooks_matched.xlsx`
2. Go to the `emr_service_items` sheet
3. Add a row for each unmapped service:
   - **Service/Product**: Exact name from EMR
   - **Matched_Item**: QuickBooks item name (e.g., "Injectables:Botox per Unit 100U")
   - **Account**: Income account
   - **Tax Code**: "Tax" or "Non"
4. Save the file
5. Re-run the invoice generation

### Command Options

```powershell
medspa invoices [OPTIONS] EMR_FILE COA_FILE
```

**Options:**
- `--output-dir PATH` - Where to save results (default: ./output)

**Examples:**

```powershell
# Save to Desktop
medspa invoices data\raw\emr.xlsx data\raw\coa.xlsx --output-dir C:\Users\Trader\Desktop\invoices

# Use different COA file
medspa invoices data\raw\emr.xlsx data\raw\COA_Updated.xlsx
```

### Complete Workflow

For a complete month-end close:

```powershell
# 1. Generate invoices (creates AR)
medspa invoices data\raw\emr_transactions.xlsx data\raw\COA_Quickbooks_matched.xlsx

# 2. Match payments (applies payments to AR)
medspa match data\raw\emr_transactions.xlsx data\raw\gravity_payments.csv

# 3. Import both files into QuickBooks via Transaction Pro
#    - First: Invoice_Import_ItemBased.csv (creates invoices)
#    - Second: Receive_Payments_From_Gravity.csv (applies payments)
```

## Troubleshooting

### "medspa: command not found"

**Solution:**
```powershell
pip install -e python_pipeline
```

### "TypeError: unsupported operand type(s) for |"

**Cause:** Python version too old (need 3.9+)

**Solution:**
Already fixed in the latest code. Pull and reinstall:
```powershell
git pull
pip install -e python_pipeline --force-reinstall --no-deps
```

### "Cannot find path 'output'"

**Cause:** The command hasn't run yet, or failed before creating output

**Solution:**
Run the match command first, then check for output:
```powershell
medspa match data\raw\emr.xlsx data\raw\gravity.csv
ls output
```

### Low Match Rate

**If only 50-70% of payments match:**

1. **Check date range:** Gravity payment dates might not align with EMR dates
   - Solution: Increase `--date-tolerance`

2. **Missing reward data:** Rewards not in `stg_emr_payments` table
   - Solution: Verify reward lines have `Payment Type` filled in EMR file

3. **Amount mismatches:** Rounding or calculation differences
   - Solution: Use `medspa debug` to check specific invoices

### No Output Files Created

**Check for errors in the console output**

Common issues:
- File paths wrong (use full paths: `C:\Users\Trader\...`)
- Files don't exist
- Wrong file format (EMR must be .xlsx, Gravity must be .csv)

## Next Steps

Once this is working well, we can expand to:

1. **CID (Customer ID) Management**
   - Automatic customer ID assignment
   - Crosswalk to QuickBooks customer names

2. **Service Mapping**
   - Map EMR service names to QuickBooks items
   - Handle unmapped services

3. **Invoice Import**
   - Generate Invoice_Import_ItemBased.csv for Transaction Pro
   - Include line items, tax, etc.

4. **Vendor Receivable JEs**
   - Journal entries for Alle Rewards, Aspire Awards, etc.
   - Debit vendor receivable, credit AR

5. **Full Automation**
   - One command to do everything
   - Exception reports for manual review

## Project Structure

```
python_pipeline/
├── medspa_pipeline/
│   ├── __init__.py
│   ├── cli.py         # Command-line interface
│   ├── loaders.py     # Load Excel/CSV files
│   └── matchers.py    # Matching logic
├── pyproject.toml     # Package configuration
├── README.md          # Overview
└── GETTING_STARTED.md # This file
```

## Support

- **Code location:** `python_pipeline/` folder
- **Git branch:** `claude/explore-codebase-015nsypKdhGzsgvhhUhRNZck`
- **Issues:** Check the README.md for common problems

## Quick Reference

```powershell
# Install
pip install -e python_pipeline

# Generate invoices
medspa invoices data\raw\emr_transactions.xlsx data\raw\COA_Quickbooks_matched.xlsx

# Run payment matching
medspa match data\raw\emr_transactions.xlsx data\raw\gravity_payments.csv

# Debug invoice
medspa debug data\raw\emr_transactions.xlsx 00039889

# Help
medspa --help
medspa invoices --help
medspa match --help
medspa debug --help
```

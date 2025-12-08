# MedSpa Accounting Automation - Complete User Guide

## Overview

This system automates your monthly accounting workflow by:
1. **Processing EMR transactions** → Service invoices
2. **Matching Gravity payments** → Payment receipts
3. **Exporting to Transaction Pro** → Import into QuickBooks Desktop

All data stays on your local machine for privacy and HIPAA compliance.

---

## Monthly Workflow (Step-by-Step)

### **Step 1: Launch the Application**

```bash
cd ~/accounting_automation/src/electron-app
npm run dev
```

The app will open showing the Dashboard tab.

---

### **Step 2: Load Customer Crosswalk (First Time Only)**

**When:** First time setup or when adding new customers

1. Go to **Customers** tab
2. Click **Import Crosswalk**
3. Select: `Customer_ID_Crosswalk_Template.xlsx`
4. Verify: Customer count shows (e.g., "616 customers")

**What this does:**
- Creates master UUID for each customer
- Links EMR Patient IDs to QB customer names
- Enables automatic customer matching

---

### **Step 3: Upload EMR Transactions**

**File:** Monthly EMR export (Excel format)

1. Go to **Transactions** tab
2. Click **Upload EMR File**
3. Select your EMR export file
4. Wait for processing...

**Results:**
- ✅ Service lines imported (invoice line items)
- ✅ Customer names extracted from transactions
- ✅ Invoice numbers generated
- ❌ Payment lines **skipped** (Gravity handles payments)

**Verify:**
- Check "Unmapped Services" - these need mappings
- Check "Staged Transactions" table
- Note the invoice count

---

### **Step 4: Review Service Mappings**

**When:** Unmapped services appear during EMR import

1. Go to **Services** tab
2. See list of unmapped EMR services
3. For each unmapped service:
   - EMR Service Name: (from EMR)
   - QB Item Name: Select from dropdown
   - Income Account: (usually from COA)
   - Tax Code: "Tax" or "Non"
4. Click **Create Mapping**

**Example:**
```
EMR Service: "Botox - Forehead"
QB Item: "Botox Injectable"
Income Account: "4010 · Product Sales - Injectables"
Tax Code: "Tax"
```

---

### **Step 5: Export EMR Invoices**

**After:** All services are mapped

1. Go to **Export** tab
2. Click **Select Output Directory**
3. Choose folder (e.g., `~/Desktop/QB_Imports/`)
4. Click **Export to Transaction Pro**

**Output:**
- `invoices_[timestamp].csv` - Service invoices only
- No payment file (Gravity handles this)

**Next:** Import this CSV to QuickBooks via Transaction Pro

---

### **Step 6: Upload Gravity Payment File**

**File:** Monthly Gravity payment processor export (CSV)

1. Go to **Gravity** tab
2. Click **Upload Gravity File**
3. Select: `gravity_payments.csv`
4. Wait for processing...

**Results:**
- Total Payments: 441 (example)
- Total Amount: $45,230.50 (example)
- Payments stored for matching

---

### **Step 7: Run Payment Matching**

**After:** Gravity file uploaded and EMR invoices loaded

1. Still on **Gravity** tab
2. Click **Match Payments**
3. Wait for algorithm to run...

**How Matching Works:**
- **Exact amount match** (highest confidence)
- **Date proximity** (same day = best)
- **Confidence levels:**
  - High (70+ points) → Auto-approved
  - Medium (40-69) → Manual review
  - Low (<40) → Manual review

**Results:**
- Matched Count: Shows auto-approved matches
- Pending Review: Matches needing approval

---

### **Step 8: Review and Approve Matches**

**When:** Pending matches require manual review

1. Scroll to **Matched Payments** table
2. For each "pending" match, review:
   - Date (should be close to invoice date)
   - Amount (should match invoice total)
   - Customer (verify correct customer)
   - Confidence score
   - Match reason
3. Click **Approve** or **Reject**

**Guidelines:**
- Approve if date + amount make sense
- Reject if clearly wrong customer or date too far off
- High confidence matches are already approved

---

### **Step 9: Export Gravity Payments**

**After:** All desired matches approved

1. Still on **Gravity** tab
2. Click **Export Payments**
3. Select output directory
4. Wait for export...

**Output:**
- `Receive_Payments_From_Gravity_[timestamp].csv`

**Format:**
```csv
Customer,TxnDate,Amount,PaymentMethod,DepositToAccount,ApplyToRefNumber
CID-a1b2c3d4,2025-10-08,450.00,Credit Card,1030 · Merchant Clearing,INV-12345
```

**Next:** Import this CSV to QuickBooks via Transaction Pro

---

### **Step 10: Import to QuickBooks**

**Files to Import:**
1. `invoices_[timestamp].csv` - Service invoices
2. `Receive_Payments_From_Gravity_[timestamp].csv` - Payments

**Process:**
1. Open QuickBooks Desktop
2. Open Transaction Pro Importer
3. Import invoices first
4. Import payments second
5. Verify:
   - Invoices show as PAID
   - 1030 Merchant Clearing has entries

---

### **Step 11: Reconcile Merchant Clearing**

**When:** Actual deposits from payment processor hit your bank

1. In QuickBooks: Banking → Make Deposits
2. Create deposit entry:
   - From: 1030 · Merchant Clearing
   - To: Your bank account
   - Amount: Match processor deposit
3. Merchant Clearing should net to zero after all deposits

---

## Troubleshooting

### **Issue: "No customers found"**
**Solution:** Import Customer Crosswalk first (Step 2)

### **Issue: "Unmapped services" warning**
**Solution:** Go to Services tab and create mappings (Step 4)

### **Issue: "No matches found" in Gravity**
**Solution:**
- Verify EMR transactions were uploaded first
- Check that invoice dates align with payment dates
- Payments can only match to existing invoices

### **Issue: "Payment amounts don't match"**
**Possible causes:**
- Tips included in payment but not in invoice
- Partial payments (multiple payments per invoice)
- Refunds or adjustments
**Action:** Manually review and approve/reject

### **Issue: "Customer name mismatch"**
**Solution:** Update customer crosswalk with correct QB name

---

## Database Location

**Local SQLite Database:**
```
~/AppData/Roaming/medspa-accounting-automation/accounting.db
```

**Backup Strategy:**
- Database auto-saves after each operation
- Use **Backup** tab to export full database
- Keep monthly backups before processing new data

---

## Data Privacy & Security

✅ **All data stays local** - no cloud uploads
✅ **SQLite database** - encrypted at OS level (if enabled)
✅ **No authentication needed** - single-user local app
✅ **HIPAA compliant** - by design (local-only access)

---

## Key Accounting Concepts

### **Chart of Accounts (COA)**
- 4xxx = Revenue (Income) accounts
- 1xxx = Asset accounts (Inventory, AR, Bank)
- 2xxx = Liability accounts (AP, Merchant Clearing)
- 5xxx = Expense accounts (COGS, Operating)

### **Merchant Clearing Account (1030)**
- **Temporary holding account**
- Receives: All customer payments
- Clears: When processor deposits to bank
- Should net to zero after deposits reconciled

### **Customer ID (CID) Format**
```
CID-{uuid}
```
Example: `CID-a1b2c3d4-e5f6-7890-abcd-ef1234567890`

Universal identifier across EMR, QB, and Gravity

### **Invoice vs. Payment**
- **Invoice** = Services rendered (drives Revenue/COGS)
- **Payment** = Money received (drives Cash/AR)
- They are separate transactions linked by invoice number

---

## Advanced Features

### **Audit Log**
- Go to **Audit** tab
- See all operations: uploads, exports, matches
- Filter by date or action type
- Useful for compliance and troubleshooting

### **Reports**
- Dashboard stats
- Transaction reports by date range
- Customer summary
- Service breakdown
- Expense categorization

### **Expense Tracking** (Credit Card)
- Upload Capital One statements
- Categorize merchants automatically
- Export to QB for expense recording

---

## Monthly Checklist

```
[ ] 1. Backup QuickBooks file
[ ] 2. Upload EMR transactions
[ ] 3. Review/add service mappings
[ ] 4. Export EMR invoices → Transaction Pro → QB
[ ] 5. Upload Gravity payments
[ ] 6. Run payment matching
[ ] 7. Review and approve pending matches
[ ] 8. Export Gravity payments → Transaction Pro → QB
[ ] 9. Reconcile merchant clearing in QB
[ ] 10. Backup accounting database
[ ] 11. Verify QB reports (P&L, Balance Sheet)
```

---

## Getting Help

**Documentation:**
- `CUSTOMER_ID_CROSSWALK.md` - Customer matching details
- `MAPPINGS.md` - Service and payment mapping rules
- `DATA_FLOW.md` - System architecture
- `IMPORT_STEPS.md` - QuickBooks import procedures

**Common Files:**
- EMR export: Excel with transaction data
- Gravity export: CSV with payment data
- Customer crosswalk: Excel with customer mappings
- COA: Chart of accounts from QuickBooks

**Support:**
- Check audit log for error details
- Review console output in terminal
- Backup database before major changes

---

## Best Practices

1. **Always backup** QuickBooks and database before imports
2. **Process in order**: Customers → EMR → Gravity → Export
3. **Review mappings** before large exports
4. **Verify totals** match between systems
5. **Reconcile monthly** - don't let merchant clearing accumulate
6. **Keep exports** for audit trail (save CSV files)
7. **Test with small batches** when first learning
8. **Document custom mappings** for consistency

---

## File Naming Convention

**EMR Exports:**
```
emr_transactions_2025-10.xlsx
```

**Gravity Exports:**
```
gravity_payments_2025-10.csv
```

**Transaction Pro Imports:**
```
invoices_2025-10-15T14-30-00.csv
Receive_Payments_From_Gravity_2025-10-15T14-35-00.csv
```

Keep organized by month for easy reference.

---

## Appendix: Sample Workflow Timeline

**Day 1 of Month:**
- Export EMR data for previous month
- Export Gravity payments for previous month

**Day 2:**
- Upload EMR to app
- Add any new service mappings
- Export invoices
- Import invoices to QB

**Day 3:**
- Upload Gravity payments
- Run matching
- Review pending matches (15-20 min typically)
- Export approved payments
- Import payments to QB

**Day 4:**
- Check merchant clearing balance
- Reconcile with actual deposits
- Verify QB reports

**Total Time:** ~2-3 hours per month (vs. 20+ hours manual)

---

**Last Updated:** December 2025
**Version:** 1.0 (with Gravity automation)

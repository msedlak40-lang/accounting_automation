# Import Steps (Safe & Repeatable)

## 0. Prep
- BACKUP your QuickBooks company file.  
- Open the correct file BEFORE opening Transaction Pro.

---

## 1. Import Invoices (Item-Based)
File: `Invoice_Import_ItemBased.csv`

Checklist:
- Items exist in QB  
- TaxCodes set  
- Quantity, Rate, Amount correct  
- Customer = CID-xxxx formatted  

Validate:
- Sales by Item  
- Inventory Valuation  
- COGS reports  
- Profit & Loss  

---

## 2. Import Receive Payments
File: `Receive_Payments_From_Gravity.csv`

Rules:
- Payments deposit into **1030 Merchant Clearing**  
- Must match **customer AND invoice number**  
- One imported payment per transaction line  

Check:
- Invoices → should show PAID  
- Merchant Clearing GL → should show offsetting entries  

---

## 3. Reconcile Merchant Clearing
When processor deposits funds:
- Make Deposit  
  - Debit Operating Bank  
  - Credit Merchant Clearing  

---

## 4. Vendor Reward Handling

### Option A (Simplest)
When vendor pays:
- Debit Bank  
- Credit Vendor Reward Income  

### Option B (More Accurate)
At time of service:
- Debit Vendor Receivable  
- Credit A/R  
- Apply credit to invoice  
Later:  
- Debit Bank  
- Credit Vendor Receivable  

---

## 5. Sales Tax
Handled automatically by:
- Item TaxCode  
- Sales Tax Item/Group in QB  

---

## 6. Exception Handling
Flagged during automation:
- Missing mapping  
- Missing Items  
- Multiple possible Gravity matches  
- Ambiguous customers  

These go to a manual review queue.

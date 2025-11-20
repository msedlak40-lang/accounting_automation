# Customer ID Crosswalk System

## Why We Built This
Your EMR, QuickBooks Desktop, Gravity, and vendor systems do **not** share customer IDs.  
Name-only matching causes:
- duplicates  
- mismatches  
- orphaned payments  
- breaking Receive Payments imports  

We solved this by creating a **Master Customer ID (CID)**.

---

## CID Format


Example:


---

## Crosswalk Table Structure

| CustomerName_EMR | EMR_ID | CustomerName_QB | QB_ListID | CID |
|------------------|--------|------------------|-----------|-----|

This table lives in your Excel master crosswalk workbook.

---

## How We Built It

### Step 1 — Extract all EMR Customers
From EMR export → pull:
- Patient Name  
- EMR Patient ID  

### Step 2 — Extract all QuickBooks Customers
Use Customer Center export.  
Pull:
- Display Name  
- ListID  
- Parent/child names  

### Step 3 — Normalize Names
Lowercase, remove punctuation, remove double spaces.

### Step 4 — Automatic Matching
EMR name ↔ QB name  
- Exact matches  
- Loose matches (ignoring punctuation)  

### Step 5 — Create New CID for Unmatched
For any EMR patient without a QB match:
- Generate new UUID  
- Create new CID  
- Optionally create a new QB customer when importing invoices.

### Step 6 — Use CID on all imports
Invoices, Payments, and Vendor JE entries use the **CID** as the customer key.

---

## Benefits
- Zero duplicates.  
- Zero name mismatch errors.  
- Payments always apply to correct invoice.  
- Vendor Receivable JEs always attach to the right customer.  

This is the foundation of your entire automation pipeline.

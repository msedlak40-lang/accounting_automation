# Med Spa Bookkeeping Automation Project

This repository documents the system we designed to automate accounting for a Med Spa using:

- EMR exports  
- Gravity payment processor exports  
- Vendor rewards (Allē, Aspire, Cherry)  
- Transaction Pro  
- QuickBooks Desktop (QBD)  
- A stable Customer ID crosswalk  
- Service-to-Item and Payment mappings  
- Clean chart of accounts

The goal is to:

1. Import **Invoices (Item-based)** to drive Revenue, COGS, and Inventory.  
2. Import **Receive Payments** to reconcile merchant clearing correctly.  
3. Handle **Vendor Rewards** as Vendor Receivables or income.  
4. Maintain a **universal customer identity** across all systems.

Start with:  
- `DATA_FLOW.md`  
- `MAPPINGS.md`  
- `CUSTOMER_ID_CROSSWALK.md`  
- `IMPORT_STEPS.md`  

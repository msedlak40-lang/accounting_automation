# Best Practices & Gotchas

## A/R Account in Journal Entries
QuickBooks SDK is extremely strict:
- A/R lines require a valid **Customer Name**
- The A/R account must be the **internal name**, not numbered

## Items Drive Accounting
- Always use Items for invoices  
- Never post revenue/COGS directly using JEs  
- Items must link to:  
  - Income Account  
  - COGS Account  
  - Inventory Asset Account  

## Merchant Clearing
- Should trend toward zero  
- Keep deposit batches matched properly  

## CID Crosswalk
- Never rely on names alone  
- CID must be persistent  
- Store crosswalk in version control  

## Testing
- Always import one invoice and one payment first  
- Validate with P&L, Balance Sheet, Inventory Valuation  

## Vendor Rewards
- Choose one treatment method and stay consistent  

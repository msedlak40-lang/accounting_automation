# System Data Flow (EMR → QB Desktop)

## High-level Architecture

EMR Export (services + payments)  
→ transform to Item-based invoice data  
→ Transaction Pro → QuickBooks Desktop  

Gravity Payments file  
→ match payments to invoices  
→ create Receive Payments import  
→ Transaction Pro → QuickBooks Desktop  

Vendor Rewards (Allē / Aspire / Cherry)  
→ Optionally create Vendor Receivable journal entries  
→ Transaction Pro → QuickBooks Desktop  

### Merchant Clearing Flow
1. ALL customer payment methods (Visa, MC, Amex, Discover, Check, Cash)  
   → Deposit to **1030 · Merchant Clearing** (via Receive Payments import)

2. When money hits bank  
   → Make Deposit  
   → Debit Bank / Credit Merchant Clearing

### Vendor Rewards Flow (2 Options)
**Option A (Simpler)**  
Recognize reward when vendor pays you.

**Option B (More granular)**  
Record Vendor Receivable at invoice creation:
- Debit Vendor Receivable  
- Credit Accounts Receivable  
- Apply credit to invoice  
- Reduce Vendor Receivable when paid


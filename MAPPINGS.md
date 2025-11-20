# Mapping Rules (Services, Items, Payments)

## 1. EMR Service → QuickBooks Item → Accounts
From your `COA_Quickbooks_matched.xlsx` tabs:

| EMR Text | QB Item | Income Account | COGS Account | Inventory Asset | Tax Code |
|---------|---------|----------------|--------------|------------------|----------|
| Botox | Botox | 4000 Injectables Income | 5000 Injectables COGS | 1320 Injectables Inventory | TAX/NON |
| Dysport | Dysport | same pattern | same | same | TAX/NON |
| SkinPen | Microneedling | 4200 Microneedling Income | 5200 Microneedling COGS | 1340 Microneedling Inventory | TAX/NON |
| Diamond Glow | Diamond Glow | 4500 Facials Income | 5500 Facials COGS | 1350 Facials Inventory | TAX |
| Retail skincare | <Brand SKU> | 4700 Retail Income | 5700 Retail COGS | 1360 Retail Inventory | TAX |

**Key rule:**  
> QB Items control the posting. We ALWAYS import items in invoices, not accounts.

---

## 2. EMR Payment Types → Posting Accounts

| EMR Payment Type | Mapping Target | Handling |
|------------------|----------------|----------|
| Visa / MasterCard / Discover / Amex / Cash / Check | **1030 Merchant Clearing** | Imported via Receive Payments |
| Client Bank | **1100 Client Bank / Prepaid Liab** | JE or invoice adjustment |
| Square Gift Card | **1150 Gift Card Liability** | JE applied later |
| Cherry | **1240 Vendor Rec: Cherry** | Usually JE entry |
| Allē Rewards | **1210 Vendor Rec: Allergan** | JE or recognize when paid |
| Aspire Rewards | **1220 Vendor Rec: Galderma** | JE or recognize when paid |
| Reward Points | **1100 Client Bank** | Same as prepaid |

---

## 3. Merchant Clearing Reconciliation
- Receive Payments → deposited to Merchant Clearing.
- Bank deposits (via Make Deposit) clear Merchant Clearing.
- Merchant Clearing should normally be near **$0** except timing gaps.


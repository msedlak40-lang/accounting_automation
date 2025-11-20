# Transaction Pro Import Field Mappings

## Invoice Import (Item-Based)

| CSV Column | TPro Field |
|------------|------------|
| Customer | Customer |
| TxnDate | TxnDate |
| RefNumber | RefNumber |
| Item | Item |
| Description | Description |
| Quantity | Quantity |
| Rate | Rate |
| Amount | Amount |
| TaxCode | SalesTaxCode |
| Memo | Memo |
| Class | Class (optional) |

**Important:**  
Invoice import triggers:
- Revenue  
- COGS  
- Inventory reduction  
ALL from the Item setup.

---

## Receive Payments Import

| CSV Column | TPro Field |
|------------|------------|
| Customer | Customer |
| TxnDate | TxnDate |
| RefNumber | Payment Reference |
| Amount | Payment Amount |
| PaymentMethod | Payment Method |
| DepositToAccount | Deposit To Account |
| ApplyToRefNumber | RefNumber (Invoice) |

All payments deposit into **1030 Merchant Clearing**.

---

## Vendor Receivable JE Import (Optional)

| CSV Column | TPro Field |
|------------|------------|
| TxnDate | TxnDate |
| RefNumber | RefNumber |
| Account | Account |
| Debit | Debit |
| Credit | Credit |
| Name | Name (required on A/R lines) |
| Memo | Memo |

**JE Structure:**
- Debit Vendor Receivable (Allē/Aspire/Cherry)  
- Credit Accounts Receivable (Name = patient CID)


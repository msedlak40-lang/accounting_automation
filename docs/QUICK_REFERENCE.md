# Quick Reference Card

## 🚀 Quick Start

```bash
cd ~/accounting_automation/src/electron-app
npm run dev
```

---

## 📋 Monthly Workflow (3 Steps)

### 1️⃣ **EMR Processing** (Invoices)
```
Transactions Tab → Upload EMR File → Map Services → Export Tab → Export
```
**Output:** `invoices_[timestamp].csv`

### 2️⃣ **Gravity Processing** (Payments)
```
Gravity Tab → Upload Gravity File → Match Payments → Review Matches → Export Payments
```
**Output:** `Receive_Payments_From_Gravity_[timestamp].csv`

### 3️⃣ **QuickBooks Import**
```
Transaction Pro → Import Invoices → Import Payments → Reconcile Merchant Clearing
```

---

## 🔑 Key Concepts

| Term | Meaning |
|------|---------|
| **CID** | Customer ID (UUID format) - universal identifier |
| **Merchant Clearing (1030)** | Temporary account - receives all payments, clears to bank |
| **Service Mapping** | EMR service name → QB item + income account |
| **Payment Matching** | Gravity payment → EMR invoice (by date + amount) |
| **Transaction Pro** | Import tool for QuickBooks Desktop |

---

## 🎯 Decision Tree

### "Where do I start?"
- **First time?** → Customers tab → Import Crosswalk
- **Monthly routine?** → Upload EMR → Upload Gravity → Export

### "I have unmapped services"
- Services tab → Create mapping → Re-export

### "Payment not matching?"
- Check date proximity (should be ≤ 7 days)
- Check amount (should match within 2%)
- Manually approve if reasonable
- Reject if clearly wrong

### "Merchant clearing not zeroing?"
- Check all payments imported
- Make deposits in QB for processor deposits
- Should balance monthly

---

## 📊 File Types

| File | Source | Contains |
|------|--------|----------|
| EMR Export | Your EMR system | Services + transaction dates |
| Gravity CSV | Payment processor | Payment amounts + card info |
| Crosswalk Excel | You create | Customer name mappings |
| Invoices CSV | This app exports | Service line items for QB |
| Payments CSV | This app exports | Payment receipts for QB |

---

## 🚨 Common Issues

| Problem | Solution |
|---------|----------|
| "No customers found" | Import crosswalk first |
| "Unmapped services" | Go to Services tab, add mappings |
| "No Gravity matches" | Upload EMR first (invoices needed) |
| "Amount mismatch" | Check for tips, refunds, or partial payments |
| "Database locked" | Close and reopen app |

---

## 💾 Backup Locations

| Item | Location |
|------|----------|
| Database | `~/AppData/Roaming/medspa-accounting-automation/accounting.db` |
| Exports | Your chosen output directory |
| QuickBooks | Backup via QB File menu |

---

## 🔢 Confidence Scores

| Score | Meaning | Action |
|-------|---------|--------|
| **High** (70+) | Auto-approved | No action needed |
| **Medium** (40-69) | Likely match | Review and approve |
| **Low** (<40) | Uncertain | Carefully review before approving |

**Scoring Factors:**
- Exact amount = +50 points
- Same day = +30 points
- Within 1 day = +20 points
- Within 3 days = +10 points

---

## 📖 Documentation Index

| Doc | Purpose |
|-----|---------|
| `USER_GUIDE.md` | **Start here** - Complete workflow |
| `DATA_FLOW.md` | System architecture |
| `CUSTOMER_ID_CROSSWALK.md` | Customer matching details |
| `MAPPINGS.md` | Service & payment mapping rules |
| `IMPORT_STEPS.md` | QuickBooks import procedures |
| `QUICK_REFERENCE.md` | **This file** - Quick answers |

---

## 🎓 Accounting 101

### **The Three Key Reports**
1. **Profit & Loss (P&L)** - Revenue minus expenses
2. **Balance Sheet** - Assets vs. Liabilities
3. **Cash Flow** - Money in/out tracking

### **Your Key Accounts**
- **1030 Merchant Clearing** - Temporary payment holding
- **1200 Accounts Receivable** - Unpaid invoices
- **4010 Product Sales** - Revenue from services
- **5000 COGS** - Cost of products used

### **The Flow**
```
Invoice Created → AR increases, Revenue increases
Payment Received → AR decreases, Merchant Clearing increases
Deposit Received → Merchant Clearing decreases, Bank increases
```

---

## ⚡ Keyboard Shortcuts (In App)

- `Tab` - Navigate tabs
- `Enter` - Submit forms
- `Esc` - Close dialogs

---

## 📞 When to Ask for Help

✅ **You should be able to handle:**
- Monthly routine processing
- Adding new service mappings
- Reviewing payment matches
- Basic QB imports

❓ **Ask for help when:**
- Database corruption
- Matching algorithm seems wrong
- Need to modify customer crosswalk structure
- QuickBooks import errors persist
- Need to add new data sources

---

## 🎯 Success Metrics

After processing, verify:
- [ ] Invoice count matches EMR export row count
- [ ] Total invoice $ matches EMR total
- [ ] Payment count matches Gravity export
- [ ] Total payment $ matches Gravity total
- [ ] QB reports show correct revenue
- [ ] Merchant Clearing balances monthly

---

**Pro Tip:** Keep a processing log noting row counts and totals each month. Makes spotting errors easy!

**Time Savings:** Manual process ~20 hrs/month → Automated ~2-3 hrs/month 🎉

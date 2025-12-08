# Bank Reconciliation Feature Design Document

**Date:** December 8, 2025
**Status:** Approved - Ready for Implementation

---

## Executive Summary

This document captures the design decisions for adding bank reconciliation functionality to the Med Spa Accounting Automation application. The feature will integrate with the existing Gravity payment matching workflow to automate the reconciliation of payment batches to bank deposits.

---

## Table of Contents

1. [Background & Context](#background--context)
2. [Key Design Decisions](#key-design-decisions)
3. [Fee Allocation Strategy](#fee-allocation-strategy)
4. [UI/Navigation Restructure](#uinavigation-restructure)
5. [Gravity Workflow Integration](#gravity-workflow-integration)
6. [Database Schema Changes](#database-schema-changes)
7. [Implementation Plan](#implementation-plan)

---

## Background & Context

### Current State

**Existing Workflows:**
1. **EMR Transaction Processing**: Upload EMR file → Generate invoices → Export to Transaction Pro
2. **Gravity Payment Matching**: Upload Gravity CSV → Match payments to invoices → Approve → Export payments to 1030 Merchant Clearing
3. **Credit Card Expenses**: Upload Capital One statement → Categorize expenses → Export
4. **Manual Bank Reconciliation**: In QuickBooks, manually create deposits from 1030 Merchant Clearing to Bank Account

**The Problem:**
- Bank reconciliation is currently manual and error-prone
- No automated matching of bank deposits to payment batches
- Merchant discount fees not automatically calculated
- No visibility into payment lifecycle (matched → exported → deposited)

### Bank Statement Data

Bank statement (`bank_statement.csv`) contains:
- **Payment processor deposits**: Gravity ACH, Clover deposits, Cherry financing, Allē/Aspire rewards
- **Merchant discount fees**: Batch deductions (e.g., "ACH Debit DISCOUNT 498479102887: $736.04")
- **Other fees**: Clover monthly ($9.13), Gravity batch ($10.00), Account history ($5.95)
- **Operating transactions**: Rent, pharmacy payments, checks, etc.

---

## Key Design Decisions

### Decision 1: Fee Allocation Strategy

**APPROVED APPROACH: Lump Sum per Batch with Distinction**

#### Merchant Discount Fees
- **Allocation**: Lump sum deduction per payment batch (NOT per-transaction)
- **Treatment**: Part of the reconciliation calculation
- **Purpose**: Explains the difference between payment batch total and bank deposit amount

**Example:**
```
Gravity Payment Batch:          $5,000.00  → Export to 1030 Merchant Clearing
Less: Merchant Discount Fee:      -$145.00  → Expense (6050 · Processing Fees)
────────────────────────────────────────────
Net Bank Deposit:               $4,855.00  → Matches bank statement ACH credit
```

**Reconciliation Formula:**
```
Payment_Batch_Total - Merchant_Discount_Fee = Bank_Deposit_Amount
```

**Why NOT per-transaction allocation?**
- Bank deposits are batched, not individual transactions
- Fees are deducted at the batch level by the processor
- Group reconciliation is simpler and matches actual bank activity
- No need for complex per-transaction fee calculations

#### Other Fees (Clover, Gravity, Account Fees)
- **Allocation**: Standalone expense entries (NOT part of reconciliation)
- **Treatment**: Separate bank debits, expensed directly
- **Purpose**: Operating expenses unrelated to payment batch reconciliation

**Example:**
```
Transaction Date: 11/12/2025
Debit:  6050 · Credit Card Processing Fees    $9.13
Credit: 1000 · Bank Account                    $9.13
Memo: "Clover monthly fee"
```

**Why separate?**
- These fees are independent of payment batches
- Including them in reconciliation would break the math
- They appear as separate bank debits
- Should be expensed, not allocated to customer payments

### Decision 2: Gravity Workflow Integration

**APPROVED APPROACH: Fully Integrated**

Bank reconciliation will **integrate directly** with the existing Gravity payment matching workflow, not run as a separate system.

**Rationale:**
1. **Data Connection**: Gravity CSV and bank statement data are inherently linked
2. **Automatic Matching**: System can match Gravity ACH deposits to approved payment batches
3. **Fee Calculation**: Merchant discount can be auto-calculated (batch total - deposit amount)
4. **Status Tracking**: Complete payment lifecycle visibility
5. **Multi-Processor Ready**: Pattern extends to Clover, Cherry, Allē processors

**Payment Lifecycle States:**
```
1. Uploaded      → Gravity CSV imported
2. Matched       → Payment matched to invoice (confidence score)
3. Approved      → User approved match
4. Exported      → Sent to Transaction Pro (1030 Merchant Clearing)
5. Pending       → Exported but not yet deposited to bank
6. Deposited     → Bank statement matched, deposit transaction created
7. Reconciled    → Export completed to QuickBooks
```

### Decision 3: UI Navigation Restructure

**APPROVED APPROACH: 5-Tab Layout**

**Current State:** 10 tabs (cluttered, will become 11+ with bank features)

**New Structure:** 5 main tabs with sub-navigation

#### Tab Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard  │  Upload  │  Review  │  Export  │  Settings    │
└─────────────────────────────────────────────────────────────┘
```

**1. Dashboard** (Home)
- System status overview
- Database statistics
- Quick action cards
- Recent activity

**2. Upload** (Data Import)
- Sub-sections:
  - EMR Transactions
  - Gravity Payments
  - Credit Card Statements
  - **Bank Statements** (NEW)
- Each sub-section has file upload and staging view

**3. Review** (Matching & Reconciliation)
- Sub-sections:
  - Payment Matching (existing Gravity workflow)
  - **Bank Reconciliation** (NEW)
- Approve/reject workflows
- Discrepancy resolution

**4. Export** (Output & Reports)
- Sub-sections:
  - Transaction Pro Export
  - Reports & Analytics
- Preview before export
- Database backup/restore

**5. Settings** (Configuration & Admin)
- Sub-sections:
  - Customers (crosswalk management)
  - Service Mappings
  - Payment Type Mappings
  - Expense Categories
  - Audit Log

**Benefits:**
- Logical workflow progression: Upload → Review → Export
- Reduces cognitive load (5 vs 10 top-level items)
- Groups related functionality
- Room for future features without clutter
- Maintains all existing functionality

---

## Gravity Workflow Integration

### Enhanced Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ EXISTING: Gravity Payment Matching                          │
└─────────────────────────────────────────────────────────────┘
         ↓
1. Upload Gravity CSV (payments, tips, sale amounts)
         ↓
2. Auto-match payments → invoices (fuzzy matching + confidence)
         ↓
3. User reviews matches (approve/reject)
         ↓
4. Export approved matches to Transaction Pro
   - Creates payment entries → 1030 Merchant Clearing
         ↓
┌─────────────────────────────────────────────────────────────┐
│ NEW: Bank Reconciliation (Integrated)                       │
└─────────────────────────────────────────────────────────────┘
         ↓
5. Upload Bank Statement CSV
         ↓
6. Auto-match Gravity ACH deposits → approved payment batches
   - Match by date range + amount tolerance
   - Calculate merchant discount: (batch total - deposit amount)
         ↓
7. User reviews deposit matches
   - Verify amounts
   - Confirm fee calculations
   - Flag discrepancies
         ↓
8. Export deposit transactions to Transaction Pro
   - Create deposit: 1030 Merchant Clearing → 1000 Bank Account
   - Create expense: Merchant Discount Fee → 6050 Processing Fees
         ↓
9. Mark payment batch as "Deposited" (status update)

```

### Auto-Matching Logic

**Matching Criteria:**
```typescript
interface DepositMatchCriteria {
  processorName: 'Gravity' | 'Clover' | 'Cherry' | 'Alle';
  dateRange: {
    // Bank deposit date should be within 1-3 business days of payment batch date
    depositDate: Date;
    paymentBatchDate: Date;
    tolerance: 3; // days
  };
  amountTolerance: {
    // Allow small discrepancies for rounding
    percentage: 0.5; // 0.5%
  };
  batchMatching: {
    // Match multiple payments that sum to deposit amount
    allowMultiplePayments: true;
  };
}
```

**Confidence Scoring:**
- **High (90-100%)**: Exact date + exact amount match
- **Medium (70-89%)**: Date within 2 days + amount within 0.5%
- **Low (50-69%)**: Date within 3 days + amount within 1%
- **Manual Review (<50%)**: Date/amount discrepancies require user review

### Fee Calculation

**Automatic Merchant Discount Calculation:**
```typescript
interface MerchantDiscountCalc {
  paymentBatchTotal: number;    // Sum of approved Gravity payments
  bankDepositAmount: number;     // From bank statement ACH credit
  merchantDiscount: number;      // Calculated: batch - deposit
  feePercentage: number;         // Calculated: discount / batch * 100

  // Validation
  isReasonable: boolean;         // Fee % between 2-4% typical
  requiresReview: boolean;       // Flag if outside expected range
}
```

**Example:**
```
Gravity Batch (11/15-11/17): $5,000.00
Bank Deposit (11/18):        $4,855.00
─────────────────────────────────────
Merchant Discount:           $145.00 (2.9%) ✓ Reasonable
```

---

## Database Schema Changes

### New Tables

#### 1. `bank_statements`
Stores uploaded bank statement transactions.

```sql
CREATE TABLE bank_statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  upload_id INTEGER,                    -- Links to file_uploads
  transaction_date TEXT NOT NULL,       -- Bank transaction date
  reference_number TEXT,                -- Check number or transaction ID
  description TEXT,                     -- Bank description
  debit_amount REAL DEFAULT 0,          -- Debit (withdrawals)
  credit_amount REAL DEFAULT 0,         -- Credit (deposits)
  transaction_type TEXT,                -- 'deposit', 'withdrawal', 'fee', 'other'
  processor TEXT,                       -- 'Gravity', 'Clover', NULL
  reconciliation_status TEXT DEFAULT 'pending',  -- 'pending', 'matched', 'reconciled', 'excluded'
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (upload_id) REFERENCES file_uploads(id)
);

CREATE INDEX idx_bank_stmt_date ON bank_statements(transaction_date);
CREATE INDEX idx_bank_stmt_status ON bank_statements(reconciliation_status);
CREATE INDEX idx_bank_stmt_processor ON bank_statements(processor);
```

#### 2. `bank_deposit_matches`
Links bank deposits to payment batches.

```sql
CREATE TABLE bank_deposit_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_statement_id INTEGER NOT NULL,    -- Bank deposit transaction
  deposit_date TEXT NOT NULL,
  processor TEXT NOT NULL,                -- 'Gravity', 'Clover', etc.
  bank_deposit_amount REAL NOT NULL,

  -- Payment batch info
  payment_batch_total REAL NOT NULL,      -- Sum of matched payments
  payment_ids TEXT NOT NULL,              -- JSON array of gravity_payment_matches.id

  -- Fee calculation
  merchant_discount_fee REAL NOT NULL,    -- batch_total - deposit_amount
  fee_percentage REAL,                    -- fee / batch * 100

  -- Matching metadata
  match_confidence REAL,                  -- 0-100 score
  match_method TEXT,                      -- 'auto', 'manual', 'partial'

  -- Status tracking
  status TEXT DEFAULT 'pending',          -- 'pending', 'approved', 'exported'
  approved_by TEXT,
  approved_at TEXT,
  exported_at TEXT,

  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (bank_statement_id) REFERENCES bank_statements(id)
);

CREATE INDEX idx_deposit_match_status ON bank_deposit_matches(status);
CREATE INDEX idx_deposit_match_date ON bank_deposit_matches(deposit_date);
```

#### 3. `bank_reconciliation_fees`
Tracks other fees (Clover, Gravity batch fees, etc.) separately from deposit reconciliation.

```sql
CREATE TABLE bank_reconciliation_fees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_statement_id INTEGER NOT NULL,
  fee_date TEXT NOT NULL,
  fee_type TEXT NOT NULL,                -- 'clover_monthly', 'gravity_batch', 'account_fee'
  fee_amount REAL NOT NULL,
  expense_account TEXT,                  -- QB account (e.g., '6050 · Processing Fees')
  description TEXT,
  status TEXT DEFAULT 'pending',         -- 'pending', 'exported'
  exported_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (bank_statement_id) REFERENCES bank_statements(id)
);
```

### Modified Tables

#### Update `gravity_payment_matches`
Add deposit tracking fields.

```sql
ALTER TABLE gravity_payment_matches
ADD COLUMN deposit_status TEXT DEFAULT 'pending';  -- 'pending', 'deposited', 'reconciled'

ALTER TABLE gravity_payment_matches
ADD COLUMN deposit_match_id INTEGER;  -- Links to bank_deposit_matches.id

ALTER TABLE gravity_payment_matches
ADD COLUMN deposited_at TEXT;

CREATE INDEX idx_gravity_deposit_status ON gravity_payment_matches(deposit_status);
```

---

## Implementation Plan

### Phase 1: UI Navigation Restructure
**Goal:** Implement 5-tab layout without breaking existing functionality

**Tasks:**
1. Create new tab component structure in `App.tsx`
2. Implement sub-navigation for each main tab
3. Migrate existing tab content to sub-sections
4. Update routing logic
5. Test all existing functionality works in new structure

**Files to Modify:**
- `src/electron-app/renderer/src/App.tsx` (main navigation)
- Add new components: `TabNavigation.tsx`, `SubNavigation.tsx`

**Acceptance Criteria:**
- All 10 existing tabs accessible via new structure
- No functionality broken
- Clean visual hierarchy (main tabs → sub-sections)
- Mobile-friendly (if applicable)

---

### Phase 2: Database Schema Implementation
**Goal:** Add new tables and modify existing schema

**Tasks:**
1. Create migration script for new tables
2. Update database initialization in `database.ts`
3. Add TypeScript interfaces for new schema
4. Test database operations (CRUD)

**Files to Modify:**
- `src/electron-app/main/database.ts`
- `src/electron-app/main/types.ts` (add interfaces)

**Acceptance Criteria:**
- All 3 new tables created successfully
- Existing data preserved
- Foreign key constraints working
- Indexes created for performance

---

### Phase 3: Bank Statement Upload & Processing
**Goal:** Upload bank CSV and parse transactions

**Tasks:**
1. Create bank statement parser (similar to `gravity-processor.ts`)
2. Add upload UI in "Upload → Bank Statements" sub-section
3. Implement transaction classification logic (deposit, fee, withdrawal)
4. Auto-detect processor from description (Gravity, Clover, etc.)
5. Display staged bank transactions with filters

**Files to Create:**
- `src/electron-app/main/bank-statement-processor.ts`

**Files to Modify:**
- `src/electron-app/renderer/src/App.tsx` (add Bank upload section)
- `src/electron-app/main/ipc-handlers.ts` (add IPC handler)

**Acceptance Criteria:**
- Can upload `bank_statement.csv`
- Transactions parsed correctly
- Processor detection works for Gravity/Clover ACH
- User can view/review staged transactions

---

### Phase 4: Auto-Matching Engine
**Goal:** Match bank deposits to payment batches

**Tasks:**
1. Implement deposit matching algorithm
2. Calculate merchant discount fees automatically
3. Generate confidence scores
4. Support manual matching for low-confidence cases
5. Display match proposals with visual indicators

**Files to Create:**
- `src/electron-app/main/bank-reconciliation-matcher.ts`

**Acceptance Criteria:**
- High-confidence matches auto-created
- Merchant discount calculated correctly
- User can approve/reject/modify matches
- Validation warnings for unreasonable fees (>5% or <1%)

---

### Phase 5: Reconciliation Review UI
**Goal:** User interface for reviewing and approving matches

**Tasks:**
1. Create "Review → Bank Reconciliation" sub-section
2. Display pending deposit matches
3. Show payment batch details (linked payments)
4. Merchant discount fee breakdown
5. Approve/reject workflow
6. Handle discrepancies (unmatched deposits)

**Files to Create:**
- `src/electron-app/renderer/src/components/BankReconciliation.tsx`

**Acceptance Criteria:**
- Clean visual display of matches
- Easy approve/reject buttons
- Drill-down into payment details
- Discrepancy flagging and resolution tools

---

### Phase 6: Transaction Pro Export Integration
**Goal:** Export deposit transactions to QuickBooks format

**Tasks:**
1. Extend `transaction-pro-exporter.ts` for deposit transactions
2. Generate deposit CSV: 1030 Merchant Clearing → 1000 Bank Account
3. Generate fee expense CSV: Merchant Discount → 6050 Processing Fees
4. Update Gravity payment status to "deposited"
5. Include deposits in export preview

**Files to Modify:**
- `src/electron-app/main/transaction-pro-exporter.ts`

**Acceptance Criteria:**
- Deposit transactions in correct Transaction Pro format
- Merchant discount fees exported as expenses
- Payment status updated correctly
- Preview shows deposits before export

---

### Phase 7: Status Tracking & Reporting
**Goal:** Complete payment lifecycle visibility

**Tasks:**
1. Update Dashboard with deposit statistics
2. Add "Pending Deposits" widget (exported but not deposited)
3. Reconciliation report (payments → deposits → bank)
4. Audit trail for all bank reconciliation actions

**Files to Modify:**
- `src/electron-app/renderer/src/App.tsx` (Dashboard section)
- `src/electron-app/main/database.ts` (add reporting queries)

**Acceptance Criteria:**
- Dashboard shows deposit pipeline status
- Reports display reconciliation completeness
- Audit log captures all bank rec actions

---

### Phase 8: Testing & Documentation
**Goal:** Ensure reliability and user understanding

**Tasks:**
1. Test with real bank statement data
2. Validate fee calculations
3. Test edge cases (partial matches, discrepancies)
4. Update `USER_GUIDE.md` with bank reconciliation workflow
5. Create troubleshooting guide

**Files to Update:**
- `USER_GUIDE.md`
- `QUICK_REFERENCE.md`
- Create `BANK_RECONCILIATION_GUIDE.md`

**Acceptance Criteria:**
- All features tested with sample data
- Documentation complete and clear
- Known limitations documented
- Troubleshooting section added

---

## Edge Cases & Considerations

### 1. Partial Deposits
**Scenario:** Bank shows $2,000 deposit, but payment batch was $5,000
**Handling:** Allow manual split matching, flag for review

### 2. Multi-Day Batches
**Scenario:** Payments from Mon-Fri deposited as single ACH on Monday
**Handling:** Match by date range (configurable 1-7 days)

### 3. Fee Variance
**Scenario:** Calculated fee is 6% (expected 2-3%)
**Handling:** Flag as "Requires Review", highlight in yellow/red

### 4. Missing Deposits
**Scenario:** Payments exported but no bank deposit found
**Handling:** "Pending Deposit" status, aging report (>7 days warning)

### 5. Duplicate Detection
**Scenario:** Same deposit matched twice
**Handling:** Prevent duplicate exports, show warning if match already exists

### 6. Multiple Processors
**Scenario:** Gravity + Clover + Cherry all need reconciliation
**Handling:** Processor-specific matching rules, configurable fee expectations

### 7. Reversals/Chargebacks
**Scenario:** Bank shows negative ACH (chargeback)
**Handling:** Flag as special transaction type, link to original payment if possible

---

## Configuration & Settings

### User-Configurable Options

```typescript
interface BankReconciliationSettings {
  matching: {
    dateToleranceDays: number;           // Default: 3
    amountTolerancePercent: number;      // Default: 0.5
    autoApproveHighConfidence: boolean;  // Default: false
  };

  fees: {
    expectedMerchantDiscountMin: number; // Default: 1.5%
    expectedMerchantDiscountMax: number; // Default: 4.0%
    defaultProcessingFeeAccount: string; // Default: '6050 · Processing Fees'
  };

  processors: {
    gravity: { enabled: boolean; feeRange: [number, number] };
    clover: { enabled: boolean; feeRange: [number, number] };
    cherry: { enabled: boolean; feeRange: [number, number] };
  };
}
```

---

## Success Metrics

### Quantitative Goals
1. **Time Savings**: Reduce bank reconciliation from 2 hours → 15 minutes per month
2. **Accuracy**: >95% auto-match success rate for high-confidence deposits
3. **Error Reduction**: Eliminate manual entry errors in deposit amounts
4. **Visibility**: 100% payment lifecycle tracking (matched → deposited → reconciled)

### Qualitative Goals
1. User confidence in automated matching
2. Easy discrepancy resolution
3. Clear audit trail for accountant review
4. Seamless integration with existing workflow

---

## Future Enhancements (Out of Scope)

### Phase 2 Features (Post-Launch)
1. **Multi-bank support**: Handle multiple bank accounts
2. **Credit card reconciliation**: Match CC expenses to CC statements
3. **QuickBooks integration**: Direct API sync (eliminate Transaction Pro)
4. **Mobile notifications**: Alert when deposits don't match
5. **Machine learning**: Improve matching confidence over time
6. **Chargeback handling**: Automated reversal entry and customer notification

---

## Approval & Sign-Off

**Design Approved By:** User
**Date:** December 8, 2025

**Key Decisions Confirmed:**
- ✅ Merchant discount fees: Lump sum per batch (NOT per-transaction)
- ✅ Other fees: Separate expense entries (NOT part of reconciliation)
- ✅ Gravity integration: Fully integrated workflow
- ✅ UI restructure: 5-tab layout with sub-navigation

**Ready to Proceed:** Yes

---

## Document History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-12-08 | Initial design document | Claude |

---

## Contact & Questions

For questions about this design or implementation details, refer to:
- `USER_GUIDE.md` - End-user workflow documentation
- `MAPPINGS.md` - Account mapping reference
- `QUICK_REFERENCE.md` - System overview

---

**END OF DESIGN DOCUMENT**

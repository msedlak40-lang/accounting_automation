# Med Spa Accounting Automation - PWA Project Plan

**Date:** 2025-11-20
**Goal:** Build a Progressive Web Application (PWA) to automate Med Spa accounting workflows

---

## Executive Summary

Build a web-based PWA that allows you to:
1. Upload EMR transaction files
2. Automatically match customers via crosswalk (with fuzzy matching for ambiguous cases)
3. Map EMR services to QuickBooks items
4. Generate Transaction Pro-ready CSV files for import into QuickBooks Desktop

---

## Current State Analysis

### ✅ What You Have

**Strong Foundation:**
- Comprehensive documentation (7 markdown files)
- Working customer ID crosswalk system (CID format)
- Complete service → item mappings (115 services mapped)
- Payment type mappings (11 payment types)
- Real example data files (2,224 EMR transactions)
- Working Transaction Pro output examples

**Data Files Available:**
- `emr_transactions.xlsx` - Primary source (2,224 rows, 14 columns)
- `COA_Quickbooks_matched.xlsx` - Critical mapping rules (2 tabs)
- `Customer_ID_Crosswalk_Template.xlsx` - Customer matching template
- `gravity_payments.csv` - Payment processor data (441 transactions)
- `item_list_qb.csv` - QuickBooks items (178 items)
- `COA_Quickbooks.csv` - Chart of accounts (118 accounts)

**Key Insights from Data:**
1. EMR already has CID field - customers use format `CID-{uuid}`
2. Customer matching is UUID-based (very reliable)
3. Service mappings are well-defined with account hierarchies
4. Payment types split into "customer paid" vs "vendor receivable"
5. Transaction Pro format is clear and standardized

---

## Architecture Overview

### Tech Stack

**Frontend (PWA):**
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS (styling)
- React Query (API state)
- PapaParse (CSV parsing)
- XLSX (Excel reading)
- RapidFuzz (fuzzy string matching)

**Backend (API):**
- FastAPI (Python)
- Supabase PostgreSQL (database)
- Pandas (data transformation)
- openpyxl (Excel handling)
- RapidFuzz (fuzzy matching)

**Deployment:**
- Frontend: Vercel or Netlify
- Backend: Railway, Render, or Fly.io
- Database: Supabase (already available)

---

## Database Schema (Supabase)

### Core Tables

#### 1. `customers` (The Crosswalk)
```sql
id                 uuid PRIMARY KEY DEFAULT gen_random_uuid()
cid                text UNIQUE NOT NULL              -- Format: CID-xxxxxxxx
customer_name_emr  text
emr_id             text
customer_name_qb   text
qb_list_id         text
is_active          boolean DEFAULT true
created_at         timestamptz DEFAULT now()
updated_at         timestamptz DEFAULT now()
```

#### 2. `customer_history` (Version Tracking)
```sql
id                 uuid PRIMARY KEY DEFAULT gen_random_uuid()
customer_id        uuid REFERENCES customers(id)
cid                text
customer_name_emr  text
emr_id             text
customer_name_qb   text
qb_list_id         text
change_type        text                             -- created, updated, merged
changed_at         timestamptz DEFAULT now()
changed_by         text
snapshot           jsonb                            -- full row data
```

#### 3. `service_mappings` (EMR → QB Items)
```sql
id                 uuid PRIMARY KEY DEFAULT gen_random_uuid()
emr_service_name   text NOT NULL
qb_item_name       text NOT NULL
qb_item_hierarchy  text                            -- e.g., "Injectables:Dysport per Unit"
asset_account      text                            -- Inventory account if applicable
income_account     text NOT NULL
tax_code           text                            -- Tax, Non
is_active          boolean DEFAULT true
created_at         timestamptz DEFAULT now()
updated_at         timestamptz DEFAULT now()

UNIQUE(emr_service_name)
```

#### 4. `payment_type_mappings`
```sql
id                 uuid PRIMARY KEY DEFAULT gen_random_uuid()
payment_type       text UNIQUE NOT NULL             -- Visa, Mastercard, Alle Rewards, etc.
category           text NOT NULL                    -- customer_paid, vendor_receivable
clearing_account   text NOT NULL                    -- 1030 · Merchant Clearing, etc.
is_active          boolean DEFAULT true
created_at         timestamptz DEFAULT now()
```

#### 5. `file_uploads` (Audit Trail)
```sql
id                 uuid PRIMARY KEY DEFAULT gen_random_uuid()
filename           text NOT NULL
file_type          text NOT NULL                    -- emr, gravity, vendor_rewards
row_count          integer
uploaded_at        timestamptz DEFAULT now()
processed_at       timestamptz
status             text                             -- uploaded, matched, exported
user_id            text
```

#### 6. `transactions_staging` (Pre-Export Buffer)
```sql
id                 uuid PRIMARY KEY DEFAULT gen_random_uuid()
upload_id          uuid REFERENCES file_uploads(id)
customer_cid       text
invoice_number     text
transaction_date   date
service_name       text
quantity           numeric
price              numeric
amount             numeric
payment_type       text
transaction_data   jsonb                            -- original row
mapped_data        jsonb                            -- after mapping applied
created_at         timestamptz DEFAULT now()
```

---

## User Workflow

### Step 1: Upload EMR File
**UI:**
```
┌─────────────────────────────────────┐
│  📁 Upload EMR Export               │
│  [Drag Excel/CSV here or click]     │
│                                     │
│  ✓ emr_transactions_Nov2025.xlsx    │
│    • 2,224 transactions             │
│    • 342 unique customers           │
│    • Date range: Jan 3 - Nov 15     │
│  [Review Customer Matches →]        │
└─────────────────────────────────────┘
```

**Backend Process:**
1. Parse Excel file with pandas
2. Extract unique CIDs from transactions
3. Match CIDs against `customers` table
4. Identify: exact matches, fuzzy candidates, new customers
5. Store in `transactions_staging` with match status

---

### Step 2: Review Customer Matches

**UI:**
```
┌─────────────────────────────────────┐
│  Customer Matching Summary          │
├─────────────────────────────────────┤
│  ✅ Exact Match:    320 customers   │
│  ⚠️  Review Needed: 12 customers    │
│  ➕ New Customers:   10 customers    │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ⚠️ Review Needed                    │
├─────────────────────────────────────┤
│ EMR: "Jennifer M Smith"             │
│ CID: CID-a3f9b2c1                   │
│                                     │
│ Suggestions:                        │
│  ○ Jennifer Smith (QB) - 92%        │
│  ○ Jennifer Smyth (QB) - 87%        │
│  ○ Create new customer              │
│  ○ Manual search: [___________]     │
│                                     │
│  [Confirm Match] [Skip]             │
└─────────────────────────────────────┘
```

**Matching Logic:**
- **Exact CID match**: Auto-confirm
- **Fuzzy name match >85%**: Show suggestions with confidence %
- **No match**: Prompt to create new or manual search
- **Saves to `customer_history`** on confirmation

---

### Step 3: Review Service Mappings

**UI:**
```
┌─────────────────────────────────────┐
│  Service Mapping Review             │
├─────────────────────────────────────┤
│  ✅ All Mapped:     2,210 rows      │
│  ⚠️  Needs Mapping: 14 rows         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ⚠️ Unknown Service                  │
├─────────────────────────────────────┤
│ EMR Service: "Botox NEW PRICING"    │
│ Appears in: 14 transactions         │
│                                     │
│ Map to QB Item:                     │
│  [Select Item ▼]                    │
│  • Injectables:Botox per Unit 100U  │
│  • Injectables:Botox per Unit 50U   │
│                                     │
│ Income Account (auto-filled):       │
│  4000 · Service Revenue:4100 ·      │
│  Injectables                        │
│                                     │
│  [Save Mapping]                     │
└─────────────────────────────────────┘
```

**Backend Process:**
1. Join `transactions_staging` with `service_mappings`
2. Flag unmapped services
3. User selects QB item → saves to `service_mappings`
4. Re-process affected transactions

---

### Step 4: Preview Journal Entries

**UI:**
```
┌─────────────────────────────────────┐
│  Transaction Pro Export Preview     │
├─────────────────────────────────────┤
│  📋 Invoice Entries:      2,224     │
│  💰 Payment Entries:      2,187     │
│  🏦 Vendor Receivables:   37        │
│                                     │
│  Total Revenue:           $847,392  │
│  Total Payments:          $823,150  │
│  Vendor Receivables:      $24,242   │
│                                     │
│  [View Details ▼]                   │
└─────────────────────────────────────┘

Details View (Expandable Table):
┌────────────────────────────────────────────────┐
│ Invoice #  Customer      Item            Amount│
├────────────────────────────────────────────────┤
│ 00030993   CID-850ee..   Growth Factor   $130  │
│ 00030995   CID-d7b96..   Dysport         $442  │
│ 00030997   CID-fe21f..   Tirzepatide     $500  │
│ ...                                            │
└────────────────────────────────────────────────┘
```

**Backend Process:**
1. Generate Transaction Pro CSV format from `transactions_staging`
2. Show summary statistics
3. Allow drill-down by invoice, customer, or service type

---

### Step 5: Export to Transaction Pro

**UI:**
```
┌─────────────────────────────────────┐
│  Export Options                     │
├─────────────────────────────────────┤
│  ☑ Invoice Import (item-based)      │
│     → 2,224 line items              │
│                                     │
│  ☑ Receive Payments                 │
│     → 2,187 payments                │
│                                     │
│  ☐ Vendor Receivables (JEs)         │
│     → 37 entries                    │
│                                     │
│  [Download All as ZIP]              │
│  [Download Separately]              │
└─────────────────────────────────────┘
```

**Output Files:**
1. `Invoice_Import_{date}.csv` - Item-based invoices
2. `Receive_Payments_{date}.csv` - Payment applications
3. `Vendor_Receivables_{date}.csv` - Journal entries (optional)

**Transaction Pro Field Formats:**

**Invoices:**
```
Customer,TxnDate,RefNumber,Item,Description,Quantity,Rate,Amount,TaxCode,Memo
CID-850eed8e...,2025-01-03,00030993,Retail Skincare:Growth Factor Eye Serum 15ml,Growth Factor Eye Serum 15ML,1.0,130.0,130.0,,EMR | customer_id=850eed8e...
```

**Payments:**
```
Customer,TxnDate,RefNumber,Amount,PaymentMethod,DepositToAccount,Memo,ApplyToRefNumber
CID-850eed8e...,2025-01-03,PMT-00030993,142.16,Visa,1030 · Merchant Clearing,EMR Payment | visa,00030993
```

---

## API Endpoints

### Uploads
```
POST   /api/upload/emr          # Upload EMR file, parse, stage
GET    /api/uploads              # List upload history
GET    /api/uploads/:id          # Get upload details
```

### Customer Crosswalk
```
GET    /api/customers                  # List all customers
POST   /api/customers                  # Create new customer
PUT    /api/customers/:id              # Update customer
GET    /api/customers/:id/history      # Version history
POST   /api/customers/match-fuzzy      # Fuzzy match customer names
POST   /api/customers/confirm-match    # Confirm a match
```

### Service Mappings
```
GET    /api/mappings/services          # List all service mappings
POST   /api/mappings/services          # Create new mapping
PUT    /api/mappings/services/:id      # Update mapping
DELETE /api/mappings/services/:id      # Deactivate mapping
```

### Payment Type Mappings
```
GET    /api/mappings/payment-types     # List payment type mappings
POST   /api/mappings/payment-types     # Create new payment type
PUT    /api/mappings/payment-types/:id # Update payment type
```

### Processing
```
POST   /api/process/apply-mappings     # Apply all mappings to staged transactions
GET    /api/process/status/:upload_id  # Get processing status
```

### Export
```
GET    /api/export/preview/:upload_id        # Preview before export
POST   /api/export/invoices/:upload_id       # Generate invoice CSV
POST   /api/export/payments/:upload_id       # Generate payments CSV
POST   /api/export/vendor-receivables/:upload_id  # Generate vendor CSV
POST   /api/export/all/:upload_id            # Download ZIP of all three
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Backend:**
- [ ] Set up FastAPI project structure
- [ ] Create Supabase tables with migrations
- [ ] Seed `service_mappings` from COA_Quickbooks_matched.xlsx
- [ ] Seed `payment_type_mappings` from COA_Quickbooks_matched.xlsx
- [ ] Build file upload endpoint
- [ ] Build CSV/Excel parsing logic

**Frontend:**
- [ ] Set up React + Vite + TypeScript project
- [ ] Configure Tailwind CSS
- [ ] Create file upload UI
- [ ] Build progress indicator component

**Outcome:** Can upload EMR file and parse it

---

### Phase 2: Customer Matching (Week 3-4)
**Backend:**
- [ ] Implement exact CID matching
- [ ] Implement fuzzy name matching (RapidFuzz)
- [ ] Build customer confirmation endpoint
- [ ] Build customer history tracking
- [ ] Add new customer creation

**Frontend:**
- [ ] Build customer matching review UI
- [ ] Show match suggestions with confidence scores
- [ ] Manual search interface
- [ ] New customer form

**Outcome:** Can match customers and handle ambiguous cases

---

### Phase 3: Service Mapping (Week 5)
**Backend:**
- [ ] Service mapping lookup logic
- [ ] Unknown service detection
- [ ] New mapping creation endpoint
- [ ] Mapping update/deactivation

**Frontend:**
- [ ] Service mapping review UI
- [ ] Dropdown for QB item selection
- [ ] Bulk mapping interface (if needed)
- [ ] Mapping management page

**Outcome:** Can map EMR services to QB items

---

### Phase 4: Transaction Processing (Week 6)
**Backend:**
- [ ] Apply all mappings to staged transactions
- [ ] Generate Transaction Pro CSV format
- [ ] Validate output against specs
- [ ] Calculate summary statistics

**Frontend:**
- [ ] Preview journal entries UI
- [ ] Summary statistics dashboard
- [ ] Drill-down tables
- [ ] Validation warnings

**Outcome:** Can preview final output

---

### Phase 5: Export & Polish (Week 7-8)
**Backend:**
- [ ] Export endpoints (invoices, payments, vendor receivables)
- [ ] ZIP archive generation
- [ ] Audit logging
- [ ] Error handling refinement

**Frontend:**
- [ ] Export selection UI
- [ ] Download functionality
- [ ] Upload history page
- [ ] Settings/configuration page

**Outcome:** Fully functional PWA

---

### Phase 6: Future Enhancements (Backlog)
- [ ] Gravity payment file matching
- [ ] Vendor rewards file processing
- [ ] Batch processing (multiple months)
- [ ] QB Desktop integration (direct import via QBXML)
- [ ] Mobile-responsive optimization
- [ ] Multi-user support
- [ ] Role-based access control
- [ ] Automated email exports
- [ ] Dashboard analytics

---

## Key Technical Decisions

### 1. Customer Matching Strategy
**Decision:** Use CID from EMR as primary key
- EMR already has CID field in format `CID-{uuid}`
- Very reliable, no fuzzy matching needed for most cases
- Fuzzy matching only for edge cases (typos, missing CIDs)

### 2. Service Mapping Storage
**Decision:** Store in Supabase, editable via UI
- Start with seed data from COA_Quickbooks_matched.xlsx
- User can add/modify mappings as new services appear
- Version history not critical (current state is sufficient)

### 3. File Processing Approach
**Decision:** Upload → Stage → Review → Export
- All processing happens in backend
- Frontend is purely UI/review
- Keeps large files off browser memory
- Enables audit trail

### 4. Transaction Pro Format
**Decision:** Generate exact format from examples
- Your example files are the spec
- Validate output against actual imports
- Iterate based on Transaction Pro feedback

---

## Questions for You

Before we proceed to implementation, please clarify:

### 1. Authentication
- Simple password/API key?
- Supabase Auth with email/password?
- OAuth (Google)?

### 2. CID Format
- Keep UUID format: `CID-{uuid}`?
- Or sequential: `CID-0001`, `CID-0002`?

### 3. Vendor Rewards Workflow
- Start with Option B (create receivable at service time)?
- Or make it selectable in UI?

### 4. Gravity Payment Matching
- Phase 1 priority or defer to Phase 6?
- How important is auto-matching invoice → payment?

### 5. Deployment Preferences
- Any preference for hosting providers?
- Budget constraints?

---

## Success Metrics

**MVP Success:**
1. Upload EMR file with 2,000+ transactions
2. Auto-match 95%+ of customers
3. Apply service mappings with <5 unknown services
4. Generate Transaction Pro CSVs in <10 seconds
5. Successfully import into QuickBooks via Transaction Pro

**User Experience:**
- Entire workflow completes in <5 minutes
- Clear error messages and guidance
- Mobile-friendly (responsive design)

---

## Next Steps

1. **Review this plan** - discuss priorities, timeline, questions
2. **Clarify questions above**
3. **Create detailed task breakdown** for Phase 1
4. **Set up development environment** (Supabase, local dev)
5. **Begin implementation** starting with backend foundation

---

## Folder Structure

```
accounting_automation/
├── docs/                           # Documentation
│   ├── README.md
│   ├── DATA_FLOW.md
│   ├── CUSTOMER_ID_CROSSWALK.md
│   ├── MAPPINGS.md
│   ├── IMPORT_STEPS.md
│   ├── TRANSACTION_PRO_FIELD_MAPPINGS.md
│   └── BEST_PRACTICES.md
├── data/
│   ├── raw/                        # Original files
│   │   ├── emr_transactions.xlsx
│   │   ├── gravity_payments.csv
│   │   ├── COA_Quickbooks_matched.xlsx
│   │   ├── item_list_qb.csv
│   │   └── Customer_ID_Crosswalk_Template.xlsx
│   ├── processed/                  # Intermediate files
│   └── output/                     # Transaction Pro exports
│       ├── Invoice_Import_ItemBased.csv
│       ├── Receive_Payments_Import.csv
│       └── JEs_Vendor_Receivables.csv
├── src/
│   ├── backend/                    # FastAPI backend
│   │   ├── api/
│   │   ├── models/
│   │   ├── services/
│   │   └── utils/
│   └── frontend/                   # React PWA
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── hooks/
│       │   ├── api/
│       │   └── utils/
│       └── public/
├── config/                         # Configuration files
├── tests/                          # Test files
└── PROJECT_PLAN.md                 # This file
```

---

**Ready to proceed?** Let me know your thoughts and answers to the questions above, and we can dive into implementation!

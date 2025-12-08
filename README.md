# Med Spa Accounting Automation

A desktop application that automates the complex accounting workflow for medical spa businesses, reducing monthly accounting work from 20+ hours to 2-3 hours while maintaining HIPAA compliance through local-only data storage.

## Overview

This Electron-based desktop application processes EMR (Electronic Medical Records) transactions, matches payment processor data, and generates QuickBooks-ready CSV files for seamless import via Transaction Pro. All data stays local on your machine for complete privacy and HIPAA compliance.

### Key Benefits

- **90% reduction in manual work** - Automates customer matching, payment reconciliation, and data transformation
- **HIPAA compliant** - All data stored locally, never sent to cloud services
- **Intelligent matching** - Automatic customer ID crosswalk with fuzzy matching for edge cases
- **Payment reconciliation** - Automated matching of Gravity Payments to EMR invoices
- **Bank reconciliation** - Automatic matching of bank deposits to payment batches with fee calculations
- **Full audit trail** - Complete logging of all operations for compliance
- **Zero hosting costs** - Runs entirely on your local machine

## Features

### Core Functionality

1. **EMR Transaction Processing**
   - Upload Excel files from EMR system
   - Automatic customer matching via UUID-based Customer ID (CID) system
   - Service-to-QuickBooks item mapping
   - Generate item-based invoice imports

2. **Payment Processor Integration**
   - Upload Gravity Payments CSV files
   - Intelligent payment matching algorithm with confidence scoring
   - Automatic reconciliation to EMR invoices
   - Generate "Receive Payments" import files

3. **Bank Reconciliation**
   - Upload bank statement CSV files
   - Match deposits to payment processor batches
   - Calculate merchant discount fees automatically
   - Generate deposit journal entries

4. **Expense Management**
   - Upload credit card statements (Capital One)
   - Auto-categorize expenses by merchant patterns
   - Distinguish COGS from operating expenses
   - Export expense journal entries

5. **Customer ID Crosswalk**
   - Universal UUID-based customer identification
   - Maps across EMR, QuickBooks, and payment processors
   - Fuzzy matching for name variations
   - Version history for audit compliance

6. **Service & Payment Mappings**
   - 115+ pre-configured service mappings (EMR → QuickBooks items)
   - 12+ payment type mappings (payment methods → clearing accounts)
   - UI for adding/editing mappings
   - Includes income accounts, COGS accounts, tax codes

## Technology Stack

### Backend (Main Process)
- **Electron 28** - Desktop application framework
- **Node.js** - Runtime environment (embedded in Electron)
- **TypeScript** - Type-safe development
- **SQLite (sql.js)** - Local database with 18 tables
- **xlsx** - Excel file parsing
- **papaparse** - CSV parsing
- **fuse.js** - Fuzzy string matching

### Frontend (Renderer Process)
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first styling
- **Vite** - Build tool and dev server

### Build & Distribution
- **electron-builder** - Application packaging for Windows/Mac/Linux
- **concurrently** - Development server orchestration

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Windows, macOS, or Linux

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd accounting_automation

# Install root dependencies
npm install

# Install Electron app dependencies
cd src/electron-app
npm install
```

### Database Setup

```bash
# Seed initial mappings (run from root directory)
npm run seed:mappings
```

### Running the Application

```bash
# From src/electron-app directory
npm run dev
```

This starts the Vite dev server and launches Electron with hot reload enabled.

### Building for Production

```bash
# From src/electron-app directory
npm run build        # Build the application
npm run package      # Package with electron-builder
```

## Documentation

Comprehensive documentation is available in the `/docs` directory:

### User Documentation
- **[User Guide](docs/USER_GUIDE.md)** - Complete walkthrough of all workflows
- **[Quick Reference](docs/QUICK_REFERENCE.md)** - Quick reference card for daily use
- **[Import Steps](docs/IMPORT_STEPS.md)** - QuickBooks import procedures via Transaction Pro
- **[Best Practices](docs/BEST_PRACTICES.md)** - Accounting best practices and tips

### Technical Documentation
- **[Data Flow](docs/DATA_FLOW.md)** - System architecture and data flow diagrams
- **[Customer ID Crosswalk](docs/CUSTOMER_ID_CROSSWALK.md)** - Customer matching system details
- **[Mappings](docs/MAPPINGS.md)** - Service and payment mapping rules
- **[Transaction Pro Field Mappings](docs/TRANSACTION_PRO_FIELD_MAPPINGS.md)** - CSV format specifications

### Project Documentation
- **[Project Plan](PROJECT_PLAN.md)** - Complete project roadmap and architecture decisions
- **[Bank Reconciliation Design](BANK_RECONCILIATION_DESIGN.md)** - Bank reconciliation feature design

## Project Structure

```
accounting_automation/
├── README.md                    # This file
├── package.json                 # Root workspace configuration
│
├── docs/                        # Comprehensive documentation
│   ├── README.md                # Documentation overview
│   ├── USER_GUIDE.md            # Complete user workflow guide
│   ├── QUICK_REFERENCE.md       # Quick reference card
│   ├── DATA_FLOW.md             # System architecture
│   ├── CUSTOMER_ID_CROSSWALK.md # Customer matching details
│   ├── MAPPINGS.md              # Service/payment mapping rules
│   ├── IMPORT_STEPS.md          # QuickBooks import procedures
│   ├── TRANSACTION_PRO_FIELD_MAPPINGS.md
│   └── BEST_PRACTICES.md
│
├── data/                        # Data files
│   ├── raw/                     # Source data files
│   │   ├── emr_transactions.xlsx
│   │   ├── gravity_payments.csv
│   │   ├── COA_Quickbooks_matched.xlsx
│   │   └── Customer_ID_Crosswalk_Template.xlsx
│   └── output/                  # Generated exports
│
├── scripts/                     # Database seeding and utilities
│   ├── README.md
│   ├── seed-mappings.js         # Seed service/payment mappings
│   └── inspect-excel.js         # Excel file inspection utility
│
└── src/electron-app/            # Main application
    ├── package.json
    ├── vite.config.ts
    ├── accounting.db            # SQLite database (generated)
    │
    ├── main/                    # Main process (Node.js backend)
    │   ├── index.ts             # Application entry point
    │   ├── database.ts          # SQLite schema (18 tables)
    │   ├── ipc-handlers.ts      # IPC API endpoints
    │   ├── emr-processor.ts     # EMR file processing
    │   ├── gravity-processor.ts # Payment matching algorithm
    │   ├── customer-crosswalk.ts # Customer ID management
    │   ├── transaction-pro-exporter.ts # CSV generation
    │   ├── bank-statement-processor.ts
    │   ├── bank-reconciliation-matcher.ts
    │   └── types.ts
    │
    ├── renderer/                # Frontend (React UI)
    │   └── src/
    │       ├── App.tsx          # Main UI component
    │       ├── main.tsx
    │       └── index.css
    │
    └── preload/                 # IPC bridge
        └── index.ts
```

## Database Schema

The application uses SQLite with 18 tables organized into logical groups:

### Customer Management (5 tables)
- `customers` - Master customer records (UUID-based)
- `customer_ids` - System-specific ID mappings
- `uuids_pool` - Pre-generated UUIDs
- `stg_emr_patients` - EMR patient staging
- `stg_qb_customers` - QuickBooks customer staging

### Transaction Processing (4 tables)
- `transactions_staging` - Staged transactions pre-export
- `stg_emr_payments` - EMR payment records
- `service_mappings` - EMR service → QB item mappings
- `payment_type_mappings` - Payment method → account mappings

### Payment Matching (2 tables)
- `stg_gravity_payments` - Gravity payment records
- `gravity_payment_matches` - Invoice-to-payment matches

### Bank Reconciliation (3 tables)
- `bank_statements` - Bank statement transactions
- `bank_deposit_matches` - Deposit-to-batch matches
- `bank_reconciliation_fees` - Processing fees

### Expense Management (2 tables)
- `expense_categories` - Merchant categorization rules
- `expense_transactions` - Credit card transactions

### System (2 tables)
- `file_uploads` - Upload history
- `audit_log` - Complete audit trail

## Typical Monthly Workflow

1. **Setup (First Time Only)**
   - Import customer ID crosswalk
   - Verify service and payment type mappings

2. **Process EMR Transactions**
   - Upload EMR Excel file
   - Review customer matches (95%+ automatic)
   - Add any new service mappings as needed
   - Export invoice import CSV

3. **Process Payment Processor Data**
   - Upload Gravity Payments CSV
   - Review automatic payment matches
   - Approve high-confidence matches (80%+ automatic)
   - Manually review medium/low confidence matches
   - Export receive payments CSV

4. **Bank Reconciliation**
   - Upload bank statement CSV
   - Review automatic deposit matches
   - Verify merchant fee calculations
   - Export deposit journal entries

5. **Import to QuickBooks**
   - Use Transaction Pro to import:
     - Invoice imports (item-based)
     - Receive payments
     - Deposit journal entries
   - Verify imports in QuickBooks

**Time Required:** 2-3 hours per month (vs 20+ hours manual)

## Troubleshooting

### Common Issues

**"No customers found"**
- Import the customer ID crosswalk first
- Check that EMR file contains CID column

**"Service not mapped"**
- Add the mapping in the Services tab
- Verify service name matches EMR exactly

**"Payment not matching"**
- Check that payment dates are within 3-day tolerance
- Verify payment amounts match exactly
- Review payment method mapping

**"Merchant clearing account not zeroing"**
- Ensure all deposits are matched and exported
- Verify merchant fees are calculated correctly
- Run bank reconciliation workflow

### Database Location

Production database location by OS:
- **Windows:** `C:\Users\[Username]\AppData\Roaming\medspa-accounting-automation\accounting.db`
- **macOS:** `~/Library/Application Support/medspa-accounting-automation/accounting.db`
- **Linux:** `~/.config/medspa-accounting-automation/accounting.db`

Development database:
- Located at `src/electron-app/accounting.db`

## Development

### Project Scripts

```bash
# Root directory
npm run seed:mappings    # Seed database with service/payment mappings
npm run inspect:excel    # Inspect Excel file structure

# Electron app directory (src/electron-app)
npm run dev              # Start development server with hot reload
npm run build            # Build for production
npm run package          # Create distributable package
npm run build:nopackage  # Build without creating package (Windows workaround)
npm run start            # Start built application
```

### Development Setup

1. Make changes to main process code in `src/electron-app/main/`
2. Make changes to UI in `src/electron-app/renderer/src/`
3. Run `npm run dev` to test with hot reload
4. Database changes require restart

### Building Releases

The application uses `electron-builder` for creating distributable packages:

```bash
cd src/electron-app
npm run build:nopackage  # Build without NSIS installer (avoids code signing)
```

The built application will be in `src/electron-app/dist/`.

## Architecture Decisions

### Why Electron Desktop App?

1. **HIPAA Compliance** - All data stays local, no cloud transmission
2. **Zero Hosting Costs** - No servers to maintain
3. **Complete Privacy** - Customer data never leaves the machine
4. **Offline Operation** - No internet required after installation
5. **Full File System Access** - Easy file uploads and exports
6. **SQL Audit Trail** - Complete compliance logging via SQLite queries

### Why SQLite?

1. **Local-First** - Single file database, easy to backup
2. **Zero Configuration** - No database server to install/manage
3. **High Performance** - Fast for the data volumes involved (thousands of transactions)
4. **SQL Queries** - Powerful audit trail and reporting capabilities
5. **Portable** - Easy to backup to OneDrive or other sync services

### Why Transaction Pro?

1. **Industry Standard** - Widely used for QuickBooks Desktop imports
2. **Item-Based Invoices** - Properly drives revenue, COGS, and inventory
3. **Receive Payments** - Correctly reconciles merchant clearing accounts
4. **Journal Entries** - Handles vendor receivables and bank deposits
5. **Validation** - Built-in validation before import reduces errors

## Success Metrics

- **95%+ automatic customer matching** - UUID-based system eliminates name matching issues
- **80%+ automatic payment matching** - High-confidence matches with date/amount algorithm
- **90% time reduction** - From 20+ hours to 2-3 hours per month
- **Zero duplicate customers** - CID system ensures unique customer records
- **Full audit compliance** - Every operation logged with timestamps
- **Bank reconciliation automation** - Automatic deposit matching and fee calculation

## Support & Contributing

For issues, questions, or contributions, please refer to the project documentation in the `/docs` directory.

### Key Resources

- [User Guide](docs/USER_GUIDE.md) - Start here for usage instructions
- [Project Plan](PROJECT_PLAN.md) - Architecture and design decisions
- [Data Flow Documentation](docs/DATA_FLOW.md) - System architecture details

## License

Copyright 2025. All rights reserved.

---

**Version:** 1.0.0
**Last Updated:** December 2025
**Platform:** Windows, macOS, Linux
**Node Version Required:** 18+

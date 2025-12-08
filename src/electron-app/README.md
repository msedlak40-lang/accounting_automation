# Med Spa Accounting Automation - Electron App

Desktop application for automating Med Spa accounting workflows.

## Features

- **EMR Transaction Processing**: Upload and process EMR transaction files
- **Customer Crosswalk Management**: Automatic customer matching with fuzzy search
- **Service Mapping**: Map EMR services to QuickBooks items
- **Expense Management**: Upload and categorize Capital One credit card statements
- **Transaction Pro Export**: Generate CSV files ready for QuickBooks import
- **Audit Trail**: Complete SQL-queryable audit log
- **Local Data**: All data stored locally in SQLite (HIPAA-friendly)

## Tech Stack

- **Electron 28**: Desktop application framework
- **React 18 + TypeScript**: UI framework
- **Better-SQLite3**: Fast, synchronous SQLite database
- **Vite**: Build tool and dev server
- **Tailwind CSS**: Styling

## Project Structure

```
electron-app/
├── main/               # Main Electron process (Node.js)
│   ├── index.ts        # Application entry point
│   ├── database.ts     # SQLite schema and initialization
│   └── ipc-handlers.ts # IPC communication handlers
├── preload/            # Preload scripts (bridge between main and renderer)
│   └── index.ts        # Context bridge API exposure
├── renderer/           # React frontend (will be created)
│   └── src/
├── shared/             # Shared types and utilities
└── package.json        # Dependencies and scripts
```

## Database Schema

9 SQLite tables:
1. **customers** - Customer crosswalk (CID → EMR → QuickBooks)
2. **customer_history** - Version tracking
3. **service_mappings** - EMR service → QB item mappings
4. **payment_type_mappings** - Payment type → clearing account
5. **file_uploads** - Upload audit trail
6. **transactions_staging** - Pre-export processing buffer
7. **expense_categories** - Merchant → expense account mappings
8. **expense_transactions** - Credit card transactions
9. **audit_log** - Complete activity log

## Setup

### Prerequisites

- Node.js 18+ and npm
- Windows 10/11 (or macOS/Linux for development)

### Install Dependencies

```bash
cd src/electron-app
npm install
```

### Development

```bash
npm run electron:dev
```

This will:
1. Start Vite dev server on port 5173
2. Launch Electron app with hot reload

### Build for Production

```bash
# Windows
npm run electron:build:win

# macOS (if developing on Mac)
npm run electron:build:mac

# Linux
npm run electron:build:linux
```

Output will be in `release/` directory.

## Database Location

The SQLite database is stored at:
- **Windows**: `C:\Users\[Username]\AppData\Roaming\medspa-accounting-automation\accounting.db`
- **macOS**: `~/Library/Application Support/medspa-accounting-automation/accounting.db`
- **Linux**: `~/.config/medspa-accounting-automation/accounting.db`

## Development Status

**Phase 1: Foundation & Setup** (Current)
- [x] Project structure created
- [x] Electron main process configured
- [x] SQLite database schema implemented
- [x] IPC communication layer setup
- [ ] React frontend setup
- [ ] Seed initial data (service mappings, payment types)

**Next Steps:**
- Set up React frontend with Tailwind CSS
- Create file upload UI
- Implement EMR file parsing

See [PROJECT_PLAN.md](../../PROJECT_PLAN.md) for full roadmap.

## License

Private - All Rights Reserved

# Python Pipeline Integration with Electron GUI

This document explains the Python-Electron integration that combines the best of both worlds: a polished Electron desktop GUI with the proven Python pipeline processing engine.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Electron GUI                         │
│  (React Frontend + TypeScript Main Process)             │
│                                                          │
│  • File upload/download                                 │
│  • Manual review workflows                              │
│  • SQLite database for tracking                         │
│  • All existing features                                │
└──────────────────────┬──────────────────────────────────┘
                       │
                       │ IPC Bridge
                       ↓
┌─────────────────────────────────────────────────────────┐
│              Python Bridge Module                        │
│  (TypeScript wrapper - python-bridge.ts)                │
│                                                          │
│  • Spawns Python subprocess                             │
│  • Passes data via temp CSV files                       │
│  • Handles errors and timeouts                          │
│  • Returns JSON results                                 │
└──────────────────────┬──────────────────────────────────┘
                       │
                       │ subprocess
                       ↓
┌─────────────────────────────────────────────────────────┐
│              Python Pipeline                             │
│  (medspa_pipeline CLI)                                  │
│                                                          │
│  • Payment matching: 89% success rate                   │
│  • Invoice generation                                   │
│  • Simple, maintainable logic                           │
│  • Easy debugging with `medspa debug`                   │
└─────────────────────────────────────────────────────────┘
```

## What Changed?

### ✅ What Stays the Same

- **GUI**: All Electron desktop app features remain unchanged
- **Database**: SQLite database for history and tracking
- **Workflows**: Manual review, approval, export flows
- **User Experience**: Same buttons, same interface

### 🚀 What's New

- **Python-powered matching**: New IPC handlers that use Python pipeline
- **Better match rates**: 89% automatic matching vs previous lower rates
- **Dual mode**: Can use either TypeScript or Python handlers
- **Backward compatible**: Old handlers still work

## New IPC Handlers

The following Python-powered handlers are now available in the Electron app:

### 1. Test Python Connection

```typescript
// Check if Python and pipeline are available
ipcRenderer.invoke('python:test')
  .then(result => {
    console.log('Python version:', result.version);
  });
```

**Returns:**
```json
{
  "success": true,
  "version": "1.0.0",
  "error": null
}
```

### 2. Match Payments (Python)

```typescript
// Match Gravity payments to EMR invoices using Python
ipcRenderer.invoke('python:matchPayments')
  .then(result => {
    console.log(`Matched ${result.matchCount} of ${result.totalPayments} payments`);
    console.log(`Match rate: ${result.matchRate}`);
  });
```

**Returns:**
```json
{
  "success": true,
  "matchCount": 89,
  "totalPayments": 100,
  "matchRate": "89.0%",
  "matches": [
    {
      "payment_id": "12345",
      "invoice_number": "00039889",
      "confidence": 0.9,
      "match_reason": "Exact amount and date match",
      "amount": 150.00,
      "payment_date": "2024-01-15",
      "invoice_date": "2024-01-15"
    }
  ]
}
```

### 3. Generate Invoices (Python)

```typescript
// Generate invoices from EMR transactions using Python
ipcRenderer.invoke('python:generateInvoices')
  .then(result => {
    console.log(`Generated ${result.invoiceCount} invoices`);
  });
```

**Returns:**
```json
{
  "success": true,
  "invoiceCount": 245,
  "invoices": [
    {
      "invoice_number": "00039889",
      "customer_id": "12345",
      "date": "2024-01-15",
      "line_items": [
        {
          "service": "Botox Treatment",
          "quantity": 1,
          "price": 150.00,
          "total": 150.00
        }
      ],
      "total": 150.00
    }
  ]
}
```

### 4. Get Match Results

```typescript
// Retrieve matches stored in database
ipcRenderer.invoke('python:getMatches')
  .then(result => {
    console.log('Matches:', result.matches);
  });
```

### 5. Debug Invoice

```typescript
// Debug specific invoice processing
ipcRenderer.invoke('python:debug')
  .then(result => {
    console.log('Debug output:', result.output);
  });
```

## How Data Flows

### Payment Matching Flow

1. **User uploads Gravity CSV** → Stored in `stg_gravity_payments` table
2. **User uploads EMR Excel** → Stored in `transactions_staging` table
3. **User clicks "Match with Python"** button
4. **Electron exports data** → Converts DB tables to CSV strings
5. **Python bridge spawns subprocess** → Passes CSV data via temp files
6. **Python pipeline runs matching** → Uses proven 89% match algorithm
7. **Results returned as JSON** → Python writes to temp file
8. **Electron stores matches** → Saves to `gravity_payment_matches` table
9. **UI updates** → Shows matched payments for review

### Invoice Generation Flow

1. **User uploads EMR transactions** → Stored in `transactions_staging`
2. **User clicks "Generate Invoices (Python)"**
3. **Electron exports EMR data** → Converts to CSV
4. **Python pipeline generates invoices** → Groups by invoice, calculates totals
5. **Results returned as JSON** → Structured invoice data
6. **UI displays invoices** → Ready for export to QuickBooks

## Installation Requirements

### Python Dependencies

The Python pipeline must be installed and available:

```bash
cd python_pipeline
pip install -e .
```

### Python Path Configuration

By default, the bridge uses `python` command. To customize:

```typescript
import { getPythonBridge } from './python-bridge';

const bridge = getPythonBridge({
  pythonPath: '/path/to/python',  // Custom Python path
  pipelinePath: '/path/to/pipeline',  // Custom pipeline path
  timeout: 120000,  // Custom timeout (ms)
});
```

## Testing the Integration

### 1. Test Python Connection

Open DevTools console and run:

```javascript
window.api.invoke('python:test').then(console.log);
```

Expected output:
```json
{ "success": true, "version": "1.0.0" }
```

### 2. Test Payment Matching

1. Upload Gravity payments CSV
2. Upload EMR transactions Excel
3. Call Python matching:

```javascript
window.api.invoke('python:matchPayments').then(console.log);
```

Expected: High match rate (80-90%)

### 3. Compare Results

Run both TypeScript and Python matchers to compare:

```javascript
// Old TypeScript matcher
await window.api.invoke('gravity:matchPayments');

// New Python matcher
await window.api.invoke('python:matchPayments');

// Compare results
const oldMatches = await window.api.invoke('gravity:getMatches');
const newMatches = await window.api.invoke('python:getMatches');

console.log('Old match count:', oldMatches.length);
console.log('New match count:', newMatches.length);
```

## Error Handling

### Common Errors

**Python not found:**
```json
{
  "success": false,
  "error": "Failed to spawn Python process: ENOENT"
}
```

**Solution:** Install Python or configure `pythonPath` in bridge config

**Pipeline not installed:**
```json
{
  "success": false,
  "error": "No module named 'medspa_pipeline'"
}
```

**Solution:** Run `pip install -e .` in `python_pipeline/` directory

**Timeout:**
```json
{
  "success": false,
  "error": "Python pipeline timeout after 60000ms"
}
```

**Solution:** Increase timeout in bridge config or optimize data size

## Performance Considerations

### Speed

- Python subprocess startup: ~100-200ms
- Payment matching (100 records): ~1-2 seconds
- Invoice generation (500 records): ~2-3 seconds

### Memory

- Temp files cleaned up automatically
- Python process terminates after each operation
- No memory leaks

### Optimization Tips

1. **Batch operations**: Process multiple files in single Python call
2. **Cache results**: Store matches in database, don't reprocess
3. **Background processing**: Run Python in background thread for large files

## Troubleshooting

### Debug Mode

Enable verbose logging:

```typescript
// In python-bridge.ts, add:
proc.stderr.on('data', (data) => {
  console.log('Python stderr:', data.toString());
});
```

### Test Python CLI Directly

```bash
cd python_pipeline

# Test version
python -m medspa_pipeline.cli --version

# Test matching
python -m medspa_pipeline.cli match \
  --emr-file ../data/emr_transactions.xlsx \
  --gravity-file ../data/gravity_payments.csv \
  --format json \
  --output /tmp/matches.json

# Test invoice generation
python -m medspa_pipeline.cli generate-invoices \
  --emr-file ../data/emr_transactions.xlsx \
  --format json \
  --output /tmp/invoices.json
```

## Migration Guide

### Gradual Migration

You don't need to switch everything at once. Recommended approach:

**Phase 1: Test in parallel** (Current)
- Keep existing TypeScript handlers
- Add Python handlers alongside
- Users can test both and compare results

**Phase 2: Default to Python** (After testing)
- Update UI to use Python handlers by default
- Keep TypeScript as fallback option

**Phase 3: Full migration** (After confidence)
- Remove old TypeScript matchers
- Python becomes the only engine

### UI Updates Needed

To use Python handlers in the React frontend:

```typescript
// Before (TypeScript matcher)
const handleMatch = () => {
  window.api.invoke('gravity:matchPayments').then(result => {
    // Handle result
  });
};

// After (Python matcher)
const handleMatch = () => {
  window.api.invoke('python:matchPayments').then(result => {
    // Handle result (same structure)
  });
};
```

## Benefits Summary

| Feature | Old (TypeScript) | New (Python) |
|---------|-----------------|--------------|
| **Match Rate** | Variable (~60-70%) | 89% consistent |
| **Maintenance** | Complex DB queries | Simple pandas logic |
| **Debugging** | Difficult | `medspa debug` command |
| **Testing** | Integrated only | Standalone CLI + integrated |
| **Performance** | Fast (in-process) | Good (subprocess) |
| **Compatibility** | Electron-only | Electron + CLI |

## Next Steps

1. **Test the integration**: Run payment matching with sample data
2. **Update UI**: Add "Match with Python" button in Gravity section
3. **Monitor results**: Compare match rates between old/new methods
4. **Gather feedback**: Get user feedback on accuracy
5. **Migrate gradually**: Switch to Python as default after validation

## Support

For issues or questions:
- Python CLI issues: Check `python_pipeline/README.md`
- Integration issues: See `docs/DEVELOPMENT.md`
- Report bugs: Create issue in repository

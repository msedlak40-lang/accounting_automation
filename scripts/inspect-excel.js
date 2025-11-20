const XLSX = require('../src/electron-app/node_modules/xlsx');
const path = require('path');

const excelPath = path.join(__dirname, '../data/raw/COA_Quickbooks_matched.xlsx');
const workbook = XLSX.readFile(excelPath);

console.log('Sheet Names:', workbook.SheetNames);

// Read Service Item Mapping tab
if (workbook.SheetNames.includes('Service Item Mapping')) {
  const serviceSheet = workbook.Sheets['Service Item Mapping'];
  const serviceData = XLSX.utils.sheet_to_json(serviceSheet);
  console.log('\n=== Service Item Mapping ===');
  console.log('Total rows:', serviceData.length);
  console.log('First 3 rows:');
  console.log(JSON.stringify(serviceData.slice(0, 3), null, 2));
  console.log('Column names:', Object.keys(serviceData[0] || {}));
}

// Read Payment Types tab
if (workbook.SheetNames.includes('Payment Types')) {
  const paymentSheet = workbook.Sheets['Payment Types'];
  const paymentData = XLSX.utils.sheet_to_json(paymentSheet);
  console.log('\n=== Payment Types ===');
  console.log('Total rows:', paymentData.length);
  console.log('All rows:');
  console.log(JSON.stringify(paymentData, null, 2));
}

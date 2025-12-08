const XLSX = require('xlsx');
const path = require('path');

const excelPath = path.join(__dirname, '../data/raw/COA_Quickbooks_matched.xlsx');
const workbook = XLSX.readFile(excelPath);

console.log('Sheet Names:', workbook.SheetNames);

// Read emr_service_items tab
if (workbook.SheetNames.includes('emr_service_items')) {
  const serviceSheet = workbook.Sheets['emr_service_items'];
  const serviceData = XLSX.utils.sheet_to_json(serviceSheet);
  console.log('\n=== emr_service_items ===');
  console.log('Total rows:', serviceData.length);
  console.log('First 3 rows:');
  console.log(JSON.stringify(serviceData.slice(0, 3), null, 2));
  console.log('Column names:', Object.keys(serviceData[0] || {}));
}

// Read emr_payment_types tab
if (workbook.SheetNames.includes('emr_payment_types')) {
  const paymentSheet = workbook.Sheets['emr_payment_types'];
  const paymentData = XLSX.utils.sheet_to_json(paymentSheet);
  console.log('\n=== emr_payment_types ===');
  console.log('Total rows:', paymentData.length);
  console.log('All rows:');
  console.log(JSON.stringify(paymentData, null, 2));
}

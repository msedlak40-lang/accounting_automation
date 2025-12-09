-- Debug queries for invoice #00039890

-- 1. Check if there's a payment line in stg_emr_payments for this invoice
SELECT '=== PAYMENT LINE (stg_emr_payments) ===' as section;
SELECT
  id,
  invoice_number,
  customer_name,
  transaction_date,
  payment_type,
  payment_amount,
  match_status
FROM stg_emr_payments
WHERE invoice_number = '00039890' OR invoice_number = '39890';

-- 2. Check service lines in transactions_staging for this invoice
SELECT '=== SERVICE LINES (transactions_staging) ===' as section;
SELECT
  id,
  invoice_number,
  transaction_date,
  service_name,
  amount,
  json_extract(transaction_data, '$.totalDue') as total_due,
  transaction_data
FROM transactions_staging
WHERE invoice_number = '00039890' OR invoice_number = '39890';

-- 3. Try the actual matching query for this invoice
SELECT '=== MATCHING QUERY RESULT ===' as section;
SELECT
  p.invoice_number,
  p.customer_name,
  p.transaction_date,
  p.payment_type,
  p.match_status,
  COUNT(t.id) as service_line_count,
  COALESCE(SUM(CAST(json_extract(t.transaction_data, '$.totalDue') AS REAL)), 0) as invoice_total
FROM stg_emr_payments p
LEFT JOIN transactions_staging t ON p.invoice_number = t.invoice_number
WHERE (p.invoice_number = '00039890' OR p.invoice_number = '39890')
GROUP BY p.id, p.invoice_number, p.customer_id, p.customer_name, p.transaction_date, p.payment_type;

-- 4. Check all invoices around that date with similar amounts
SELECT '=== SIMILAR INVOICES (within $10 of $387.05) ===' as section;
SELECT
  p.invoice_number,
  p.customer_name,
  p.transaction_date,
  p.payment_type,
  p.match_status,
  COALESCE(SUM(CAST(json_extract(t.transaction_data, '$.totalDue') AS REAL)), 0) as invoice_total
FROM stg_emr_payments p
LEFT JOIN transactions_staging t ON p.invoice_number = t.invoice_number
WHERE p.match_status = 'unmatched'
  AND DATE(p.transaction_date) BETWEEN '2025-10-01' AND '2025-10-15'
  AND LOWER(p.payment_type) IN ('visa', 'mastercard', 'amex', 'discover')
GROUP BY p.id, p.invoice_number, p.customer_id, p.customer_name, p.transaction_date, p.payment_type
HAVING ABS(invoice_total - 387.05) < 10.00
ORDER BY ABS(invoice_total - 387.05);

-- 5. Check if there are any service lines with Total Due = 387.05
SELECT '=== SERVICE LINES WITH TOTAL DUE NEAR $387.05 ===' as section;
SELECT
  invoice_number,
  transaction_date,
  service_name,
  json_extract(transaction_data, '$.totalDue') as total_due
FROM transactions_staging
WHERE ABS(CAST(json_extract(transaction_data, '$.totalDue') AS REAL) - 387.05) < 0.01;

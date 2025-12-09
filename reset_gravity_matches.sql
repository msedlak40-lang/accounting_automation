-- Reset Gravity payment matching to allow re-processing with improved matching logic
-- This will clear all existing matches and reset payment statuses

BEGIN TRANSACTION;

-- 1. Delete all existing match records
DELETE FROM gravity_payment_matches;

-- 2. Reset all Gravity payment statuses to 'unmatched'
UPDATE stg_gravity_payments
SET match_status = 'unmatched';

-- 3. Reset EMR payment statuses
UPDATE stg_emr_payments
SET match_status = 'unmatched',
    matched_payment_id = NULL;

-- 4. Verify counts
SELECT 'Gravity payments reset' as status, COUNT(*) as count
FROM stg_gravity_payments WHERE match_status = 'unmatched'
UNION ALL
SELECT 'Match records cleared', COUNT(*)
FROM gravity_payment_matches
UNION ALL
SELECT 'EMR payments reset', COUNT(*)
FROM stg_emr_payments WHERE match_status = 'unmatched';

COMMIT;

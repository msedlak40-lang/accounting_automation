import { Database } from 'sql.js';
import { v4 as uuidv4 } from 'uuid';
import {
  // BankDepositMatch,
  DepositMatchProposal,
  DepositMatchCriteria,
  DEFAULT_BANK_RECONCILIATION_CONFIG,
} from './types';

interface MatchingStats {
  totalDeposits: number;
  highConfidenceMatches: number;
  mediumConfidenceMatches: number;
  lowConfidenceMatches: number;
  unmatched: number;
}

/**
 * Run automatic deposit matching for bank statements
 */
export async function matchBankDeposits(
  db: Database,
  _dbPath: string,
  criteria?: Partial<DepositMatchCriteria>
): Promise<{ success: boolean; stats: MatchingStats; error?: string }> {
  try {
    console.log('[Bank Matcher] Starting automatic deposit matching...');

    // Merge with default criteria
    const matchCriteria: DepositMatchCriteria = {
      ...DEFAULT_BANK_RECONCILIATION_CONFIG.matching,
      ...DEFAULT_BANK_RECONCILIATION_CONFIG.fees,
      ...criteria,
    };

    // Get unmatched bank deposits
    const deposits = getUnmatchedDeposits(db);
    console.log(`[Bank Matcher] Found ${deposits.length} unmatched deposits`);

    const stats: MatchingStats = {
      totalDeposits: deposits.length,
      highConfidenceMatches: 0,
      mediumConfidenceMatches: 0,
      lowConfidenceMatches: 0,
      unmatched: 0,
    };

    // Process each deposit
    for (const deposit of deposits) {
      try {
        const match = await findBestMatch(db, deposit, matchCriteria);

        if (match) {
          // Create match record
          createDepositMatch(db, match);

          // Update stats based on confidence
          if (match.confidence >= 90) {
            stats.highConfidenceMatches++;
          } else if (match.confidence >= 70) {
            stats.mediumConfidenceMatches++;
          } else {
            stats.lowConfidenceMatches++;
          }

          console.log(
            `[Bank Matcher] Matched deposit ${deposit.id} with confidence ${match.confidence.toFixed(1)}%`
          );
        } else {
          stats.unmatched++;
          console.log(`[Bank Matcher] No match found for deposit ${deposit.id}`);
        }
      } catch (error) {
        console.error(`[Bank Matcher] Error matching deposit ${deposit.id}:`, error);
        stats.unmatched++;
      }
    }

    // Log audit entry
    db.run(
      `INSERT INTO audit_log (action, entity_type, details)
       VALUES (?, ?, ?)`,
      ['bank_deposits_matched', 'bank_deposit_matches', JSON.stringify(stats)]
    );

    console.log('[Bank Matcher] Matching complete:', stats);
    return { success: true, stats };
  } catch (error: any) {
    console.error('[Bank Matcher] Error during matching:', error);
    return { success: false, stats: null as any, error: error.message };
  }
}

/**
 * Get unmatched bank deposits
 */
function getUnmatchedDeposits(db: Database): any[] {
  const query = `
    SELECT bs.*
    FROM bank_statements bs
    LEFT JOIN bank_deposit_matches bdm ON bs.id = bdm.bank_statement_id
    WHERE bs.transaction_type = 'deposit'
      AND bs.processor IS NOT NULL
      AND bs.reconciliation_status = 'pending'
      AND bdm.id IS NULL
    ORDER BY bs.transaction_date DESC
  `;

  const stmt = db.prepare(query);
  const results: any[] = [];

  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * Find best matching payment batch for a bank deposit
 */
async function findBestMatch(
  db: Database,
  deposit: any,
  criteria: DepositMatchCriteria
): Promise<DepositMatchProposal | null> {
  // Get approved payment batches that haven't been deposited yet
  const paymentBatches = getUnmatchedPaymentBatches(db, deposit.processor, deposit.transaction_date, criteria);

  if (paymentBatches.length === 0) {
    return null;
  }

  let bestMatch: DepositMatchProposal | null = null;
  let bestScore = 0;

  for (const batch of paymentBatches) {
    const proposal = evaluateMatch(deposit, batch, criteria);

    if (proposal && proposal.confidence > bestScore) {
      bestScore = proposal.confidence;
      bestMatch = proposal;
    }
  }

  // Only return matches above minimum threshold (50%)
  return bestMatch && bestMatch.confidence >= 50 ? bestMatch : null;
}

/**
 * Get unmatched payment batches
 */
function getUnmatchedPaymentBatches(
  db: Database,
  _processor: string,
  depositDate: string,
  criteria: DepositMatchCriteria
): any[] {
  // Calculate date range
  const depositDateObj = new Date(depositDate);
  const startDate = new Date(depositDateObj);
  startDate.setDate(startDate.getDate() - criteria.dateToleranceDays);
  const endDate = new Date(depositDateObj);
  endDate.setDate(endDate.getDate() + criteria.dateToleranceDays);

  const query = `
    SELECT
      gpm.id as match_id,
      DATE(sgp.transaction_datetime) as payment_date,
      SUM(sgp.total_amount) as batch_total,
      COUNT(*) as payment_count,
      GROUP_CONCAT(gpm.id) as payment_ids
    FROM gravity_payment_matches gpm
    INNER JOIN stg_gravity_payments sgp ON gpm.payment_id = sgp.id
    WHERE gpm.match_status = 'approved'
      AND gpm.deposit_status = 'pending'
      AND DATE(sgp.transaction_datetime) BETWEEN ? AND ?
    GROUP BY DATE(sgp.transaction_datetime)
    ORDER BY DATE(sgp.transaction_datetime) DESC
  `;

  const stmt = db.prepare(query);
  stmt.bind([startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();

  return results;
}

/**
 * Evaluate how well a deposit matches a payment batch
 */
function evaluateMatch(
  deposit: any,
  batch: any,
  criteria: DepositMatchCriteria
): DepositMatchProposal | null {
  const depositAmount = Number(deposit.credit_amount);
  const batchTotal = Number(batch.batch_total);

  // Calculate merchant discount fee
  const merchantFee = batchTotal - depositAmount;
  const feePercentage = (merchantFee / batchTotal) * 100;

  // Check if fee is reasonable
  if (
    feePercentage < criteria.expectedMerchantDiscountMin ||
    feePercentage > criteria.expectedMerchantDiscountMax
  ) {
    // Fee is outside expected range - low confidence or no match
    if (feePercentage < 0 || feePercentage > 10) {
      return null; // Completely unreasonable
    }
  }

  // Calculate confidence score
  let confidence = 0;
  let reasons: string[] = [];

  // Date proximity score (0-40 points)
  // Note: Typical processing time is 2 days from service to deposit
  const depositDate = new Date(deposit.transaction_date);
  const paymentDate = new Date(batch.payment_date);
  const daysDiff = Math.abs((depositDate.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24));

  if (daysDiff === 2) {
    // 2 days is the typical/expected delay
    confidence += 40;
    reasons.push('2-day deposit (typical processing time)');
  } else if (daysDiff >= 1 && daysDiff <= 3) {
    // 1-3 days is normal range
    confidence += 38;
    reasons.push(`${Math.round(daysDiff)}-day deposit (normal range)`);
  } else if (daysDiff === 0) {
    // Same day is unusual but possible
    confidence += 30;
    reasons.push('Same day deposit (unusual but valid)');
  } else if (daysDiff === 4) {
    // 4 days is slightly delayed
    confidence += 25;
    reasons.push('4-day delay (slightly longer than typical)');
  } else if (daysDiff <= criteria.dateToleranceDays) {
    // 5+ days within tolerance but concerning
    confidence += 15;
    reasons.push(`${Math.round(daysDiff)}-day delay (longer than typical)`);
  } else {
    return null; // Outside date tolerance
  }

  // Amount accuracy score (0-40 points)
  const amountDiff = Math.abs(batchTotal - depositAmount);
  const amountDiffPercent = (amountDiff / batchTotal) * 100;

  if (amountDiffPercent <= 0.1) {
    confidence += 40;
    reasons.push('Amount matches within 0.1%');
  } else if (amountDiffPercent <= 0.5) {
    confidence += 35;
    reasons.push('Amount matches within 0.5%');
  } else if (amountDiffPercent <= 1.0) {
    confidence += 25;
    reasons.push('Amount matches within 1%');
  } else if (amountDiffPercent <= criteria.amountTolerancePercent) {
    confidence += 15;
    reasons.push(`Amount difference: ${amountDiffPercent.toFixed(2)}%`);
  } else {
    return null; // Amount difference too large
  }

  // Fee reasonableness score (0-20 points)
  const feeDeviation = Math.abs(feePercentage - 2.9); // Assuming 2.9% is typical
  if (feeDeviation <= 0.5) {
    confidence += 20;
    reasons.push(`Fee ${feePercentage.toFixed(2)}% is typical`);
  } else if (feeDeviation <= 1.0) {
    confidence += 15;
    reasons.push(`Fee ${feePercentage.toFixed(2)}% is reasonable`);
  } else if (
    feePercentage >= criteria.expectedMerchantDiscountMin &&
    feePercentage <= criteria.expectedMerchantDiscountMax
  ) {
    confidence += 10;
    reasons.push(`Fee ${feePercentage.toFixed(2)}% is within expected range`);
  } else {
    confidence += 5;
    reasons.push(`Fee ${feePercentage.toFixed(2)}% is unusual`);
  }

  return {
    bankStatementId: deposit.id,
    depositDate: deposit.transaction_date,
    depositAmount,
    processor: deposit.processor,
    paymentIds: batch.payment_ids.split(','),
    paymentBatchTotal: batchTotal,
    merchantDiscountFee: merchantFee,
    feePercentage,
    confidence,
    matchMethod: 'auto',
    matchReason: reasons.join('; '),
  };
}

/**
 * Create a deposit match record
 */
function createDepositMatch(db: Database, proposal: DepositMatchProposal): void {
  const matchId = uuidv4();

  db.run(
    `INSERT INTO bank_deposit_matches (
      id, bank_statement_id, deposit_date, processor,
      bank_deposit_amount, payment_batch_total, payment_ids,
      merchant_discount_fee, fee_percentage,
      match_confidence, match_method, status,
      notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      matchId,
      proposal.bankStatementId,
      proposal.depositDate,
      proposal.processor,
      proposal.depositAmount,
      proposal.paymentBatchTotal,
      JSON.stringify(proposal.paymentIds),
      proposal.merchantDiscountFee,
      proposal.feePercentage,
      proposal.confidence,
      proposal.matchMethod,
      'pending', // Status starts as pending, needs user approval
      proposal.matchReason,
    ]
  );

  // Update bank statement status
  db.run(
    `UPDATE bank_statements SET reconciliation_status = ? WHERE id = ?`,
    ['matched', proposal.bankStatementId]
  );
}

/**
 * Get all deposit matches with payment details
 */
export function getDepositMatches(db: Database, status?: string): any[] {
  let query = `
    SELECT
      bdm.*,
      bs.transaction_date as bank_date,
      bs.description as bank_description,
      bs.credit_amount as bank_amount
    FROM bank_deposit_matches bdm
    INNER JOIN bank_statements bs ON bdm.bank_statement_id = bs.id
    WHERE 1=1
  `;

  const params: any[] = [];

  if (status) {
    query += ` AND bdm.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY bdm.deposit_date DESC, bdm.created_at DESC`;

  const stmt = db.prepare(query);
  stmt.bind(params);

  const results: any[] = [];
  while (stmt.step()) {
    const match = stmt.getAsObject();

    // Parse payment_ids JSON
    let paymentIds: string[] = [];
    try {
      paymentIds = JSON.parse(match.payment_ids as string);
      match.payment_ids_array = paymentIds;
    } catch {
      match.payment_ids_array = [];
    }

    // Fetch payment details for each payment in the batch
    if (paymentIds.length > 0) {
      const paymentDetails: any[] = [];
      const placeholders = paymentIds.map(() => '?').join(',');

      const paymentQuery = `
        SELECT
          gpm.id as match_id,
          gpm.invoice_number,
          gpm.customer_id,
          gp.total_amount,
          gp.transaction_datetime,
          gp.card_type,
          c.qb_display_name as customer_name
        FROM gravity_payment_matches gpm
        INNER JOIN stg_gravity_payments gp ON gpm.payment_id = gp.id
        LEFT JOIN customers c ON gpm.customer_id = c.customer_id
        WHERE gpm.id IN (${placeholders})
        ORDER BY gp.transaction_datetime
      `;

      const paymentStmt = db.prepare(paymentQuery);
      paymentStmt.bind(paymentIds);

      while (paymentStmt.step()) {
        paymentDetails.push(paymentStmt.getAsObject());
      }
      paymentStmt.free();

      match.payment_details = paymentDetails;
    } else {
      match.payment_details = [];
    }

    results.push(match);
  }
  stmt.free();

  return results;
}

/**
 * Approve a deposit match
 */
export function approveDepositMatch(
  db: Database,
  _dbPath: string,
  matchId: string,
  approvedBy: string = 'user'
): { success: boolean; error?: string } {
  try {
    // Get match details
    const stmt = db.prepare('SELECT * FROM bank_deposit_matches WHERE id = ?');
    stmt.bind([matchId]);

    if (!stmt.step()) {
      stmt.free();
      return { success: false, error: 'Match not found' };
    }

    const match = stmt.getAsObject();
    stmt.free();

    // Update match status
    db.run(
      `UPDATE bank_deposit_matches
       SET status = 'approved', approved_by = ?, approved_at = datetime('now')
       WHERE id = ?`,
      [approvedBy, matchId]
    );

    // Update bank statement status
    db.run(
      `UPDATE bank_statements SET reconciliation_status = 'reconciled' WHERE id = ?`,
      [match.bank_statement_id]
    );

    // Update gravity payment matches to deposited status
    const paymentIds = JSON.parse(match.payment_ids as string);
    const placeholders = paymentIds.map(() => '?').join(',');
    db.run(
      `UPDATE gravity_payment_matches
       SET deposit_status = 'deposited', deposit_match_id = ?, deposited_at = datetime('now')
       WHERE id IN (${placeholders})`,
      [matchId, ...paymentIds]
    );

    // Save database
    const fs = require('fs');
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);

    // Log audit entry
    db.run(
      `INSERT INTO audit_log (action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?)`,
      ['deposit_match_approved', 'bank_deposit_match', matchId, `Approved by ${approvedBy}`]
    );

    return { success: true };
  } catch (error: any) {
    console.error('[Bank Matcher] Error approving match:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Reject a deposit match
 */
export function rejectDepositMatch(
  db: Database,
  _dbPath: string,
  matchId: string
): { success: boolean; error?: string } {
  try {
    // Get match details
    const stmt = db.prepare('SELECT * FROM bank_deposit_matches WHERE id = ?');
    stmt.bind([matchId]);

    if (!stmt.step()) {
      stmt.free();
      return { success: false, error: 'Match not found' };
    }

    const match = stmt.getAsObject();
    stmt.free();

    // Delete the match
    db.run('DELETE FROM bank_deposit_matches WHERE id = ?', [matchId]);

    // Reset bank statement status
    db.run(
      `UPDATE bank_statements SET reconciliation_status = 'pending' WHERE id = ?`,
      [match.bank_statement_id]
    );

    // Save database
    const fs = require('fs');
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);

    // Log audit entry
    db.run(
      `INSERT INTO audit_log (action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?)`,
      ['deposit_match_rejected', 'bank_deposit_match', matchId, 'Match rejected by user']
    );

    return { success: true };
  } catch (error: any) {
    console.error('[Bank Matcher] Error rejecting match:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get deposit match summary statistics
 */
export function getDepositMatchSummary(db: Database): {
  totalMatches: number;
  pendingMatches: number;
  approvedMatches: number;
  totalDepositAmount: number;
  totalMerchantFees: number;
} {
  const query = `
    SELECT
      COUNT(*) as total_matches,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_matches,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_matches,
      SUM(bank_deposit_amount) as total_deposit_amount,
      SUM(merchant_discount_fee) as total_merchant_fees
    FROM bank_deposit_matches
  `;

  const stmt = db.prepare(query);
  let result = {
    totalMatches: 0,
    pendingMatches: 0,
    approvedMatches: 0,
    totalDepositAmount: 0,
    totalMerchantFees: 0,
  };

  if (stmt.step()) {
    const row = stmt.getAsObject();
    result = {
      totalMatches: Number(row.total_matches) || 0,
      pendingMatches: Number(row.pending_matches) || 0,
      approvedMatches: Number(row.approved_matches) || 0,
      totalDepositAmount: Number(row.total_deposit_amount) || 0,
      totalMerchantFees: Number(row.total_merchant_fees) || 0,
    };
  }

  stmt.free();
  return result;
}

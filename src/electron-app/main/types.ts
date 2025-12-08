/**
 * Type definitions for Med Spa Accounting Automation
 */

// ===== Bank Reconciliation Types =====

export interface BankStatement {
  id: string;
  upload_id: string;
  transaction_date: string;
  reference_number?: string;
  description?: string;
  debit_amount: number;
  credit_amount: number;
  transaction_type?: 'deposit' | 'withdrawal' | 'fee' | 'other';
  processor?: 'Gravity' | 'Clover' | 'Cherry' | 'Alle' | null;
  reconciliation_status: 'pending' | 'matched' | 'reconciled' | 'excluded';
  notes?: string;
  created_at: string;
}

export interface BankDepositMatch {
  id: string;
  bank_statement_id: string;
  deposit_date: string;
  processor: 'Gravity' | 'Clover' | 'Cherry' | 'Alle';
  bank_deposit_amount: number;
  payment_batch_total: number;
  payment_ids: string; // JSON array of gravity_payment_matches.id
  merchant_discount_fee: number;
  fee_percentage?: number;
  match_confidence?: number;
  match_method: 'auto' | 'manual' | 'partial';
  status: 'pending' | 'approved' | 'exported';
  approved_by?: string;
  approved_at?: string;
  exported_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface BankReconciliationFee {
  id: string;
  bank_statement_id: string;
  fee_date: string;
  fee_type: 'clover_monthly' | 'gravity_batch' | 'account_fee' | 'other';
  fee_amount: number;
  expense_account?: string;
  description?: string;
  status: 'pending' | 'exported';
  exported_at?: string;
  created_at: string;
}

export interface GravityPaymentMatch {
  id: string;
  payment_id: string;
  invoice_number: string;
  customer_id?: string;
  match_confidence: string;
  match_score?: number;
  match_status: 'pending' | 'approved' | 'rejected';
  match_reason?: string;
  approved_by?: string;
  approved_at?: string;
  deposit_status: 'pending' | 'deposited' | 'reconciled';
  deposit_match_id?: string;
  deposited_at?: string;
  created_at: string;
}

// ===== Bank Reconciliation Request/Response Types =====

export interface BankStatementUploadRequest {
  filePath: string;
}

export interface BankStatementUploadResponse {
  success: boolean;
  uploadId: string;
  stats: {
    totalRows: number;
    deposits: number;
    withdrawals: number;
    fees: number;
    unclassified: number;
  };
  error?: string;
}

export interface DepositMatchingRequest {
  uploadId?: string;
  dateToleranceDays?: number;
  amountTolerancePercent?: number;
}

export interface DepositMatchingResponse {
  success: boolean;
  stats: {
    totalDeposits: number;
    highConfidenceMatches: number;
    mediumConfidenceMatches: number;
    lowConfidenceMatches: number;
    unmatched: number;
  };
  error?: string;
}

export interface ApproveDepositMatchRequest {
  matchId: string;
  approvedBy?: string;
}

export interface ApproveDepositMatchResponse {
  success: boolean;
  error?: string;
}

export interface BankReconciliationExportRequest {
  outputDir: string;
  matchIds?: string[];
}

export interface BankReconciliationExportResponse {
  success: boolean;
  depositsExported: number;
  feesExported: number;
  depositFilePath?: string;
  feeFilePath?: string;
  error?: string;
}

// ===== Matching Algorithm Types =====

export interface DepositMatchCriteria {
  dateToleranceDays: number;
  amountTolerancePercent: number;
  autoApproveHighConfidence: boolean;
  expectedMerchantDiscountMin: number;
  expectedMerchantDiscountMax: number;
}

export interface DepositMatchProposal {
  bankStatementId: string;
  depositDate: string;
  depositAmount: number;
  processor: string;
  paymentIds: string[];
  paymentBatchTotal: number;
  merchantDiscountFee: number;
  feePercentage: number;
  confidence: number;
  matchMethod: 'auto' | 'manual' | 'partial';
  matchReason: string;
}

// ===== Database Query Result Types =====

export interface BankStatementWithDetails extends BankStatement {
  match_id?: string;
  match_status?: string;
  payment_count?: number;
  batch_total?: number;
}

export interface DepositMatchWithDetails extends BankDepositMatch {
  bank_transaction_date?: string;
  bank_description?: string;
  payment_details?: Array<{
    payment_id: string;
    invoice_number: string;
    customer_name?: string;
    amount: number;
  }>;
}

// ===== Configuration Types =====

export interface BankReconciliationConfig {
  matching: {
    dateToleranceDays: number;
    amountTolerancePercent: number;
    autoApproveHighConfidence: boolean;
  };
  fees: {
    expectedMerchantDiscountMin: number;
    expectedMerchantDiscountMax: number;
    defaultProcessingFeeAccount: string;
  };
  processors: {
    gravity: { enabled: boolean; feeRange: [number, number] };
    clover: { enabled: boolean; feeRange: [number, number] };
    cherry: { enabled: boolean; feeRange: [number, number] };
  };
}

// ===== Default Configuration =====

export const DEFAULT_BANK_RECONCILIATION_CONFIG: BankReconciliationConfig = {
  matching: {
    dateToleranceDays: 3,
    amountTolerancePercent: 0.5,
    autoApproveHighConfidence: false,
  },
  fees: {
    expectedMerchantDiscountMin: 1.5,
    expectedMerchantDiscountMax: 4.0,
    defaultProcessingFeeAccount: '6050 · Credit Card Processing Fees',
  },
  processors: {
    gravity: { enabled: true, feeRange: [2.5, 3.5] },
    clover: { enabled: true, feeRange: [2.5, 3.5] },
    cherry: { enabled: false, feeRange: [0, 0] },
  },
};

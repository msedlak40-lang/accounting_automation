import { useState, useEffect } from 'react';

// Declare window.electronAPI type
declare global {
  interface Window {
    electronAPI: {
      customers: {
        getAll: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
        getAllWithMappings: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
        getUnmappedEMR: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
        getStats: () => Promise<{ success: boolean; data?: any; error?: string }>;
        updateNames: (data: { customer_id: string; qb_display_name?: string; emr_name?: string; emr_patient_id?: string }) =>
          Promise<{ success: boolean; error?: string }>;
        importCrosswalk: (excelPath?: string) => Promise<{
          success: boolean;
          customersImported: number;
          mappingsImported: number;
          error?: string;
        }>;
        selectCrosswalkFile: () => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
      };
      serviceMappings: {
        getAll: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
        create: (data: { emr_service_name: string; qb_item_name: string; income_account: string; tax_code?: string }) =>
          Promise<{ success: boolean; data?: { id: string }; error?: string }>;
      };
      paymentTypes: {
        getAll: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
        create: (data: { payment_type: string; category: string; clearing_account: string }) =>
          Promise<{ success: boolean; data?: { id: string }; error?: string }>;
      };
      audit: {
        getLogs: (options?: any) => Promise<{ success: boolean; data?: any[]; error?: string }>;
      };
      seed: {
        serviceMappings: (excelPath?: string) => Promise<{ success: boolean; count: number; error?: string }>;
        paymentTypeMappings: (excelPath?: string) => Promise<{ success: boolean; count: number; error?: string }>;
      };
      emr: {
        selectFile: () => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
        processFile: (filePath: string) => Promise<{
          success: boolean;
          uploadId: string;
          stats: {
            totalRows: number;
            invoiceCount: number;
            serviceLines: number;
            paymentLines: number;
            unmappedServices: string[];
            unmappedPaymentTypes: string[];
          };
          error?: string;
        }>;
        getStagedTransactions: (options?: { uploadId?: string; limit?: number; offset?: number }) =>
          Promise<{ success: boolean; data?: any[]; error?: string }>;
        getSummary: (uploadId?: string) => Promise<{ success: boolean; data?: { invoices: number; services: number; payments: number }; error?: string }>;
        getUploads: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
      };
      export: {
        selectDirectory: () => Promise<{ success: boolean; canceled?: boolean; dirPath?: string; error?: string }>;
        preview: (uploadId?: string) => Promise<{
          success: boolean;
          data?: { invoiceLines: number; paymentLines: number; unmappedServices: string[]; unmappedPayments: string[] };
          error?: string;
        }>;
        transactionPro: (data: { outputDir: string; uploadId?: string }) => Promise<{
          success: boolean;
          invoicesExported: number;
          paymentsExported: number;
          invoiceFilePath?: string;
          paymentsFilePath?: string;
          error?: string;
          warnings: string[];
        }>;
      };
      cc: {
        selectFile: () => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
        processFile: (filePath: string) => Promise<any>;
        getTransactions: (options?: any) => Promise<{ success: boolean; data?: any[]; error?: string }>;
        getSummary: (uploadId?: string) => Promise<{ success: boolean; data?: any; error?: string }>;
        getCategories: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
        addCategory: (data: any) => Promise<{ success: boolean; id?: string; error?: string }>;
        updateTransactionCategory: (data: any) => Promise<{ success: boolean; error?: string }>;
      };
      backup: {
        export: () => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
        import: () => Promise<{ success: boolean; canceled?: boolean; message?: string; requiresRestart?: boolean; error?: string }>;
      };
      reports: {
        transactionsByDateRange: (data: { startDate: string; endDate: string }) => Promise<{ success: boolean; data?: any[]; error?: string }>;
        customerSummary: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
        serviceBreakdown: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
        expenseSummary: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
        dashboardStats: () => Promise<{ success: boolean; data?: any; error?: string }>;
      };
      gravity: {
        selectFile: () => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
        processFile: (filePath: string) => Promise<{
          success: boolean;
          uploadId: string;
          stats: { totalRows: number; paymentCount: number; totalAmount: number };
          error?: string;
        }>;
        matchPayments: (uploadId?: string) => Promise<{
          success: boolean;
          matchCount: number;
          unmatchedCount: number;
          matches: any[];
          error?: string;
        }>;
        getSummary: (uploadId?: string) => Promise<{
          success: boolean;
          data?: { totalPayments: number; totalAmount: number; matchedCount: number; unmatchedCount: number };
          error?: string;
        }>;
        getMatches: (uploadId?: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
        getTransactions: (options?: { uploadId?: string; limit?: number }) => Promise<{ success: boolean; data?: any[]; error?: string }>;
        approveMatch: (matchId: string) => Promise<{ success: boolean; error?: string }>;
        rejectMatch: (matchId: string) => Promise<{ success: boolean; error?: string }>;
        export: (outputDir: string) => Promise<{ success: boolean; paymentsExported: number; filePath?: string; error?: string }>;
      };
      bank: {
        selectFile: () => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
        processFile: (filePath: string) => Promise<{
          success: boolean;
          uploadId: string;
          stats: { totalRows: number; deposits: number; withdrawals: number; fees: number; unclassified: number };
          error?: string;
        }>;
        getStatements: (options?: { uploadId?: string; limit?: number }) => Promise<{ success: boolean; data?: any[]; error?: string }>;
        getSummary: (uploadId?: string) => Promise<{ success: boolean; data?: any; error?: string }>;
        getDepositsByProcessor: (uploadId?: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
        matchDeposits: (criteria?: any) => Promise<{
          success: boolean;
          stats: { totalDeposits: number; highConfidenceMatches: number; mediumConfidenceMatches: number; lowConfidenceMatches: number; unmatched: number };
          error?: string;
        }>;
        getMatches: (status?: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
        getMatchSummary: () => Promise<{ success: boolean; data?: any; error?: string }>;
        approveMatch: (matchId: string) => Promise<{ success: boolean; error?: string }>;
        rejectMatch: (matchId: string) => Promise<{ success: boolean; error?: string }>;
      };
    };
  }
}

type TabType = 'dashboard' | 'upload' | 'review' | 'export' | 'settings';
type UploadSubTab = 'emr' | 'gravity' | 'expenses' | 'bank';
type ReviewSubTab = 'payment-matching' | 'bank-reconciliation';
type ExportSubTab = 'transaction-pro' | 'reports';
type SettingsSubTab = 'customers' | 'services' | 'payments' | 'audit';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [uploadSubTab, setUploadSubTab] = useState<UploadSubTab>('emr');
  const [reviewSubTab, setReviewSubTab] = useState<ReviewSubTab>('payment-matching');
  const [exportSubTab, setExportSubTab] = useState<ExportSubTab>('transaction-pro');
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>('customers');
  const [dbStatus, setDbStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [stats, setStats] = useState({ customers: 0, mappings: 0, paymentTypes: 0, logs: 0, transactions: 0 });

  // Data for tables
  const [serviceMappings, setServiceMappings] = useState<any[]>([]);
  const [paymentTypes, setPaymentTypes] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [uploads, setUploads] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [flaggedTransactions, setFlaggedTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // EMR upload state
  const [processing, setProcessing] = useState(false);
  const [processingResult, setProcessingResult] = useState<any>(null);

  // Customer crosswalk state
  const [importingCrosswalk, setImportingCrosswalk] = useState(false);
  const [crosswalkResult, setCrosswalkResult] = useState<any>(null);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<any>(null);
  const [exportPreview, setExportPreview] = useState<any>(null);

  // Search/filter state
  const [serviceSearch, setServiceSearch] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [txnSearch, setTxnSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showUnmappedCustomersOnly, setShowUnmappedCustomersOnly] = useState(false);
  const [showUnmappedTxnOnly, setShowUnmappedTxnOnly] = useState(false);

  // Add mapping modal state
  const [showAddService, setShowAddService] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newService, setNewService] = useState({ emr_service_name: '', qb_item_name: '', income_account: '', tax_code: 'Non' });
  const [newPayment, setNewPayment] = useState({ payment_type: '', category: 'Merchant', clearing_account: '1030 Merchant Clearing' });
  const [addingMapping, setAddingMapping] = useState(false);

  // Customer edit modal state
  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<{
    customer_id: string;
    emr_patient_id: string;
    emr_name: string;
    qb_display_name: string;
  } | null>(null);
  const [savingCustomer, setSavingCustomer] = useState(false);

  // CC/Expense state
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<any[]>([]);
  const [ccProcessing, setCcProcessing] = useState(false);
  const [ccResult, setCcResult] = useState<any>(null);
  const [expenseSearch, setExpenseSearch] = useState('');

  // Reports state
  const [reportData, setReportData] = useState<any>(null);
  const [reportType, setReportType] = useState<'customers' | 'services' | 'expenses'>('customers');
  const [loadingReport, setLoadingReport] = useState(false);

  // Gravity payment matching state
  const [gravityProcessing, setGravityProcessing] = useState(false);
  const [gravityResult, setGravityResult] = useState<any>(null);
  const [gravitySummary, setGravitySummary] = useState<any>(null);
  const [gravityMatches, setGravityMatches] = useState<any[]>([]);
  const [gravityTransactions, setGravityTransactions] = useState<any[]>([]);
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<any>(null);
  const [exportResult, setExportResult] = useState<any>(null);
  const [exporting, setExporting] = useState(false);

  // Bank statement state
  const [bankProcessing, setBankProcessing] = useState(false);
  const [bankResult, setBankResult] = useState<any>(null);
  const [bankSummary, setBankSummary] = useState<any>(null);
  const [bankStatements, setBankStatements] = useState<any[]>([]);
  const [depositsByProcessor, setDepositsByProcessor] = useState<any[]>([]);

  // Bank reconciliation matching state
  const [bankMatching, setBankMatching] = useState(false);
  const [bankMatchResult, setBankMatchResult] = useState<any>(null);
  const [bankMatches, setBankMatches] = useState<any[]>([]);
  const [bankMatchSummary, setBankMatchSummary] = useState<any>(null);

  useEffect(() => {
    checkDatabase();
  }, []);

  const checkDatabase = async () => {
    try {
      const [customers, mappings, payments, logs, txnSummary, uploadsResult] = await Promise.all([
        window.electronAPI.customers.getAll(),
        window.electronAPI.serviceMappings.getAll(),
        window.electronAPI.paymentTypes.getAll(),
        window.electronAPI.audit.getLogs({ limit: 100 }),
        window.electronAPI.emr.getSummary(),
        window.electronAPI.emr.getUploads(),
      ]);

      if (customers.success && mappings.success && payments.success && logs.success) {
        setStats({
          customers: customers.data?.length || 0,
          mappings: mappings.data?.length || 0,
          paymentTypes: payments.data?.length || 0,
          logs: logs.data?.length || 0,
          transactions: txnSummary.data?.invoices || 0,
        });
        setServiceMappings(mappings.data || []);
        setPaymentTypes(payments.data || []);
        setAuditLogs(logs.data || []);
        setUploads(uploadsResult.data || []);
        setDbStatus('ready');
      } else {
        setDbStatus('error');
      }
    } catch (error) {
      console.error('Database check failed:', error);
      setDbStatus('error');
    }
  };

  const refreshData = async () => {
    setLoading(true);
    await checkDatabase();
    setLoading(false);
  };

  const loadTransactions = async () => {
    const result = await window.electronAPI.emr.getStagedTransactions({ limit: 500 });
    if (result.success) {
      setTransactions(result.data || []);
    }
  };

  const loadFlaggedTransactions = async () => {
    const result = await window.electronAPI.emr.getFlaggedTransactions();
    if (result.success) {
      setFlaggedTransactions(result.data || []);
    }
  };

  // Load data when tab becomes active
  useEffect(() => {
    if (activeTab === 'upload' && uploadSubTab === 'emr') {
      loadTransactions();
      loadFlaggedTransactions();
    }
    if (activeTab === 'settings' && settingsSubTab === 'customers') {
      loadCustomers();
    }
    if (activeTab === 'export' && exportSubTab === 'transaction-pro') {
      loadExportPreview();
    }
    if (activeTab === 'upload' && uploadSubTab === 'expenses') {
      loadExpenses();
    }
    if (activeTab === 'upload' && uploadSubTab === 'gravity') {
      loadGravityData();
    }
    if (activeTab === 'upload' && uploadSubTab === 'bank') {
      loadBankData();
    }
    if (activeTab === 'review' && reviewSubTab === 'payment-matching') {
      loadGravityData();
    }
    if (activeTab === 'review' && reviewSubTab === 'bank-reconciliation') {
      loadBankReconciliationData();
    }
    if (activeTab === 'export' && exportSubTab === 'reports') {
      loadReport();
    }
  }, [activeTab, uploadSubTab, reviewSubTab, exportSubTab, settingsSubTab, reportType]);

  const loadExportPreview = async () => {
    const result = await window.electronAPI.export.preview();
    if (result.success) {
      setExportPreview(result.data);
    }
  };

  const loadCustomers = async () => {
    const result = await window.electronAPI.customers.getAllWithMappings();
    if (result.success) {
      setCustomers(result.data || []);
    }
  };

  const loadExpenses = async () => {
    const [txnResult, catResult] = await Promise.all([
      window.electronAPI.cc.getTransactions({ limit: 500 }),
      window.electronAPI.cc.getCategories(),
    ]);
    if (txnResult.success) {
      setExpenses(txnResult.data || []);
    }
    if (catResult.success) {
      setExpenseCategories(catResult.data || []);
    }
  };

  const loadReport = async () => {
    setLoadingReport(true);
    try {
      let result;
      if (reportType === 'customers') {
        result = await window.electronAPI.reports.customerSummary();
      } else if (reportType === 'services') {
        result = await window.electronAPI.reports.serviceBreakdown();
      } else {
        result = await window.electronAPI.reports.expenseSummary();
      }
      if (result.success) {
        setReportData(result.data || []);
      }
    } finally {
      setLoadingReport(false);
    }
  };

  const handleCCUpload = async () => {
    try {
      const fileResult = await window.electronAPI.cc.selectFile();
      if (!fileResult.success || fileResult.canceled || !fileResult.filePath) {
        return;
      }

      setCcProcessing(true);
      setCcResult(null);

      const result = await window.electronAPI.cc.processFile(fileResult.filePath);
      setCcResult(result);

      if (result.success) {
        await loadExpenses();
      }
    } catch (error: any) {
      console.error('CC upload error:', error);
      setCcResult({ success: false, error: error.message });
    } finally {
      setCcProcessing(false);
    }
  };

  const loadGravityData = async () => {
    const [summaryResult, matchesResult, transactionsResult] = await Promise.all([
      window.electronAPI.gravity.getSummary(),
      window.electronAPI.gravity.getMatches(),
      window.electronAPI.gravity.getTransactions({ limit: 500 }),
    ]);
    if (summaryResult.success) {
      setGravitySummary(summaryResult.data);
    }
    if (matchesResult.success) {
      setGravityMatches(matchesResult.data || []);
    }
    if (transactionsResult.success) {
      setGravityTransactions(transactionsResult.data || []);
    }
  };

  const handleGravityUpload = async () => {
    try {
      const fileResult = await window.electronAPI.gravity.selectFile();
      if (!fileResult.success || fileResult.canceled || !fileResult.filePath) {
        return;
      }

      setGravityProcessing(true);
      setGravityResult(null);

      const result = await window.electronAPI.gravity.processFile(fileResult.filePath);
      setGravityResult(result);

      if (result.success) {
        await loadGravityData();
      }
    } catch (error: any) {
      console.error('Gravity upload error:', error);
      setGravityResult({ success: false, error: error.message });
    } finally {
      setGravityProcessing(false);
    }
  };

  const handleMatchPayments = async () => {
    try {
      setMatching(true);
      setMatchResult(null);

      const result = await window.electronAPI.gravity.matchPayments();
      setMatchResult(result);

      if (result.success) {
        await loadGravityData();
      }
    } catch (error: any) {
      console.error('Payment matching error:', error);
      setMatchResult({ success: false, error: error.message });
    } finally {
      setMatching(false);
    }
  };

  const handleApproveMatch = async (matchId: string) => {
    const result = await window.electronAPI.gravity.approveMatch(matchId);
    if (result.success) {
      await loadGravityData();
    }
  };

  const handleRejectMatch = async (matchId: string) => {
    const result = await window.electronAPI.gravity.rejectMatch(matchId);
    if (result.success) {
      await loadGravityData();
    }
  };

  const handleGravityExport = async () => {
    try {
      setExporting(true);
      setExportResult(null);

      // Select output directory
      const dirResult = await window.electronAPI.export.selectDirectory();
      if (dirResult.canceled || !dirResult.dirPath) {
        setExporting(false);
        return;
      }

      // Export Gravity payments
      const result = await window.electronAPI.gravity.export(dirResult.dirPath);
      setExportResult(result);

      if (result.success) {
        await loadGravityData();
      }
    } catch (error: any) {
      console.error('Gravity export error:', error);
      setExportResult({ success: false, error: error.message });
    } finally {
      setExporting(false);
    }
  };

  // Bank statement handlers
  const handleBankUpload = async () => {
    try {
      const fileResult = await window.electronAPI.bank.selectFile();
      if (!fileResult.success || fileResult.canceled || !fileResult.filePath) {
        return;
      }

      setBankProcessing(true);
      setBankResult(null);

      const result = await window.electronAPI.bank.processFile(fileResult.filePath);
      setBankResult(result);

      if (result.success) {
        await loadBankData();
      }
    } catch (error: any) {
      console.error('Bank upload error:', error);
      setBankResult({ success: false, error: error.message });
    } finally {
      setBankProcessing(false);
    }
  };

  const loadBankData = async () => {
    try {
      const [summaryResult, statementsResult, depositsResult] = await Promise.all([
        window.electronAPI.bank.getSummary(),
        window.electronAPI.bank.getStatements({ limit: 100 }),
        window.electronAPI.bank.getDepositsByProcessor()
      ]);

      if (summaryResult.success) {
        setBankSummary(summaryResult.data);
      }
      if (statementsResult.success) {
        setBankStatements(statementsResult.data || []);
      }
      if (depositsResult.success) {
        setDepositsByProcessor(depositsResult.data || []);
      }
    } catch (error) {
      console.error('Error loading bank data:', error);
    }
  };

  const handleBankMatchDeposits = async () => {
    try {
      setBankMatching(true);
      setBankMatchResult(null);

      const result = await window.electronAPI.bank.matchDeposits();
      setBankMatchResult(result);

      if (result.success) {
        await loadBankReconciliationData();
      }
    } catch (error: any) {
      console.error('Bank matching error:', error);
      setBankMatchResult({ success: false, error: error.message });
    } finally {
      setBankMatching(false);
    }
  };

  const loadBankReconciliationData = async () => {
    try {
      const [matchesResult, summaryResult] = await Promise.all([
        window.electronAPI.bank.getMatches(),
        window.electronAPI.bank.getMatchSummary()
      ]);

      if (matchesResult.success) {
        setBankMatches(matchesResult.data || []);
      }
      if (summaryResult.success) {
        setBankMatchSummary(summaryResult.data);
      }
    } catch (error) {
      console.error('Error loading bank reconciliation data:', error);
    }
  };

  const handleApproveBankMatch = async (matchId: string) => {
    const result = await window.electronAPI.bank.approveMatch(matchId);
    if (result.success) {
      await loadBankReconciliationData();
    }
  };

  const handleRejectBankMatch = async (matchId: string) => {
    const result = await window.electronAPI.bank.rejectMatch(matchId);
    if (result.success) {
      await loadBankReconciliationData();
    }
  };

  const handleBackupExport = async () => {
    const result = await window.electronAPI.backup.export();
    if (result.success && !result.canceled) {
      alert(`Backup saved to: ${result.filePath}`);
    } else if (!result.success) {
      alert(`Backup failed: ${result.error}`);
    }
  };

  const handleBackupImport = async () => {
    if (!confirm('This will replace all current data. Are you sure you want to restore from a backup?')) {
      return;
    }
    const result = await window.electronAPI.backup.import();
    if (result.success && !result.canceled) {
      alert(result.message || 'Backup restored successfully. Please restart the application.');
    } else if (!result.success) {
      alert(`Restore failed: ${result.error}`);
    }
  };

  const handleImportCrosswalk = async () => {
    try {
      // Open file dialog
      const fileResult = await window.electronAPI.customers.selectCrosswalkFile();
      if (!fileResult.success || fileResult.canceled || !fileResult.filePath) {
        return;
      }

      setImportingCrosswalk(true);
      setCrosswalkResult(null);

      const result = await window.electronAPI.customers.importCrosswalk(fileResult.filePath);
      setCrosswalkResult(result);

      if (result.success) {
        await refreshData();
        await loadCustomers();
      }
    } catch (error: any) {
      console.error('Crosswalk import error:', error);
      setCrosswalkResult({ success: false, error: error.message });
    } finally {
      setImportingCrosswalk(false);
    }
  };

  const handleExport = async () => {
    try {
      // Select output directory
      const dirResult = await window.electronAPI.export.selectDirectory();
      if (!dirResult.success || dirResult.canceled || !dirResult.dirPath) {
        return;
      }

      setExporting(true);
      setExportResult(null);

      const result = await window.electronAPI.export.transactionPro({ outputDir: dirResult.dirPath });
      setExportResult(result);

      if (result.success) {
        await refreshData();
      }
    } catch (error: any) {
      console.error('Export error:', error);
      setExportResult({ success: false, error: error.message, warnings: [] });
    } finally {
      setExporting(false);
    }
  };

  const handleEMRUpload = async () => {
    try {
      // Open file dialog
      const fileResult = await window.electronAPI.emr.selectFile();
      if (!fileResult.success || fileResult.canceled || !fileResult.filePath) {
        return;
      }

      setProcessing(true);
      setProcessingResult(null);

      // Process the file
      const result = await window.electronAPI.emr.processFile(fileResult.filePath);
      setProcessingResult(result);

      if (result.success) {
        // Refresh data
        await refreshData();
        await loadTransactions();
      }
    } catch (error: any) {
      console.error('EMR upload error:', error);
      setProcessingResult({ success: false, error: error.message });
    } finally {
      setProcessing(false);
    }
  };

  const handleAddServiceMapping = async () => {
    if (!newService.emr_service_name || !newService.qb_item_name || !newService.income_account) {
      return;
    }
    setAddingMapping(true);
    try {
      const result = await window.electronAPI.serviceMappings.create(newService);
      if (result.success) {
        setNewService({ emr_service_name: '', qb_item_name: '', income_account: '', tax_code: 'Non' });
        setShowAddService(false);
        await refreshData();
      }
    } catch (error) {
      console.error('Error adding service mapping:', error);
    } finally {
      setAddingMapping(false);
    }
  };

  const handleAddPaymentType = async () => {
    if (!newPayment.payment_type || !newPayment.category || !newPayment.clearing_account) {
      return;
    }
    setAddingMapping(true);
    try {
      const result = await window.electronAPI.paymentTypes.create(newPayment);
      if (result.success) {
        setNewPayment({ payment_type: '', category: 'Merchant', clearing_account: '1030 Merchant Clearing' });
        setShowAddPayment(false);
        await refreshData();
      }
    } catch (error) {
      console.error('Error adding payment type:', error);
    } finally {
      setAddingMapping(false);
    }
  };

  const handleEditCustomer = (customer: any) => {
    setEditingCustomer({
      customer_id: customer.customer_id || '',
      emr_patient_id: customer.emr_patient_id || '',
      emr_name: customer.emr_name || '',
      qb_display_name: customer.qb_display_name || '',
    });
    setShowEditCustomer(true);
  };

  const handleSaveCustomer = async () => {
    if (!editingCustomer || !editingCustomer.customer_id) {
      return;
    }
    setSavingCustomer(true);
    try {
      const result = await window.electronAPI.customers.updateNames({
        customer_id: editingCustomer.customer_id,
        qb_display_name: editingCustomer.qb_display_name || undefined,
        emr_name: editingCustomer.emr_name || undefined,
        emr_patient_id: editingCustomer.emr_patient_id || undefined,
      });
      if (result.success) {
        setShowEditCustomer(false);
        setEditingCustomer(null);
        await loadCustomers();
      } else {
        console.error('Error saving customer:', result.error);
        alert(`Error saving customer: ${result.error}`);
      }
    } catch (error) {
      console.error('Error saving customer:', error);
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleLinkTransaction = async (transactionId: string, customerId: string) => {
    try {
      const result = await window.electronAPI.customers.linkTransaction(transactionId, customerId);
      if (result.success) {
        await loadFlaggedTransactions();
        await loadTransactions();
        alert('Transaction linked to customer successfully');
      } else {
        alert(`Error linking transaction: ${result.error}`);
      }
    } catch (error) {
      console.error('Error linking transaction:', error);
      alert('Error linking transaction');
    }
  };

  const handleCreateNewCustomer = async (transactionId: string, emrPatientId: string, patientName: string) => {
    try {
      const result = await window.electronAPI.customers.createFromFlaggedTransaction(transactionId, emrPatientId, patientName);
      if (result.success) {
        await loadFlaggedTransactions();
        await loadTransactions();
        await loadCustomers();
        alert('New customer created successfully');
      } else {
        alert(`Error creating customer: ${result.error}`);
      }
    } catch (error) {
      console.error('Error creating customer:', error);
      alert('Error creating customer');
    }
  };

  // Filter service mappings
  const filteredServices = serviceMappings.filter(s =>
    s.emr_service_name?.toLowerCase().includes(serviceSearch.toLowerCase()) ||
    s.qb_item_name?.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  // Filter payment types
  const filteredPayments = paymentTypes.filter(p =>
    p.payment_type?.toLowerCase().includes(paymentSearch.toLowerCase()) ||
    p.clearing_account?.toLowerCase().includes(paymentSearch.toLowerCase())
  );

  // Filter transactions
  const filteredTransactions = transactions.filter(t => {
    // Text search filter
    const matchesSearch = !txnSearch ||
      t.invoice_number?.toLowerCase().includes(txnSearch.toLowerCase()) ||
      t.customer_cid?.toLowerCase().includes(txnSearch.toLowerCase()) ||
      t.service_name?.toLowerCase().includes(txnSearch.toLowerCase()) ||
      t.payment_type?.toLowerCase().includes(txnSearch.toLowerCase());

    // Unmapped filter - show only transactions with unmapped services or payments
    // Only consider unmapped if there IS a service/payment that needs mapping
    const hasUnmappedService = t.service_name && !t.service_mapped;
    const hasUnmappedPayment = t.payment_type && !t.payment_mapped;
    const isUnmapped = hasUnmappedService || hasUnmappedPayment;
    const matchesUnmapped = !showUnmappedTxnOnly || isUnmapped;

    return matchesSearch && matchesUnmapped;
  });

  // Filter customers (using new UUID-based schema fields)
  const filteredCustomers = customers.filter(c => {
    // Text search filter
    const matchesSearch = !customerSearch ||
      c.customer_id?.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.emr_patient_id?.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.emr_name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.qb_display_name?.toLowerCase().includes(customerSearch.toLowerCase());

    // Unmapped filter - show only customers without QB mapping
    const isUnmapped = !c.qb_display_name;
    const matchesUnmapped = !showUnmappedCustomersOnly || isUnmapped;

    return matchesSearch && matchesUnmapped;
  });

  // Count unmapped items for display
  const unmappedCustomerCount = customers.filter(c => !c.qb_display_name).length;
  const unmappedTxnCount = transactions.filter(t =>
    (t.service_name && !t.service_mapped) || (t.payment_type && !t.payment_mapped)
  ).length;

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'upload', label: 'Upload', icon: '📤' },
    { id: 'review', label: 'Review', icon: '🔄' },
    { id: 'export', label: 'Export', icon: '📥' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  const uploadSubTabs = [
    { id: 'emr', label: `EMR Transactions (${stats.transactions})`, icon: '📋' },
    { id: 'gravity', label: 'Gravity Payments', icon: '💳' },
    { id: 'expenses', label: `Credit Card (${expenses.length})`, icon: '💰' },
    { id: 'bank', label: 'Bank Statement', icon: '🏦' },
  ];

  const reviewSubTabs = [
    { id: 'payment-matching', label: 'Payment Matching', icon: '🔗' },
    { id: 'bank-reconciliation', label: 'Bank Reconciliation', icon: '✅' },
  ];

  const exportSubTabs = [
    { id: 'transaction-pro', label: 'Transaction Pro', icon: '📥' },
    { id: 'reports', label: 'Reports', icon: '📈' },
  ];

  const settingsSubTabs = [
    { id: 'customers', label: `Customers (${stats.customers})`, icon: '👥' },
    { id: 'services', label: `Service Mappings (${stats.mappings})`, icon: '🔗' },
    { id: 'payments', label: `Payment Types (${stats.paymentTypes})`, icon: '💳' },
    { id: 'audit', label: `Audit Log (${stats.logs})`, icon: '📝' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-4 px-4">
          <h1 className="text-2xl font-bold text-gray-900">
            Med Spa Accounting Automation
          </h1>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex space-x-4" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-1">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Sub-Navigation */}
      {activeTab === 'upload' && (
        <div className="bg-gray-100 border-b">
          <div className="max-w-7xl mx-auto px-4">
            <nav className="flex space-x-2 py-2" aria-label="Sub-tabs">
              {uploadSubTabs.map((subTab) => (
                <button
                  key={subTab.id}
                  onClick={() => setUploadSubTab(subTab.id as UploadSubTab)}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    uploadSubTab === subTab.id
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <span className="mr-1">{subTab.icon}</span>
                  {subTab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {activeTab === 'review' && (
        <div className="bg-gray-100 border-b">
          <div className="max-w-7xl mx-auto px-4">
            <nav className="flex space-x-2 py-2" aria-label="Sub-tabs">
              {reviewSubTabs.map((subTab) => (
                <button
                  key={subTab.id}
                  onClick={() => setReviewSubTab(subTab.id as ReviewSubTab)}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    reviewSubTab === subTab.id
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <span className="mr-1">{subTab.icon}</span>
                  {subTab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {activeTab === 'export' && (
        <div className="bg-gray-100 border-b">
          <div className="max-w-7xl mx-auto px-4">
            <nav className="flex space-x-2 py-2" aria-label="Sub-tabs">
              {exportSubTabs.map((subTab) => (
                <button
                  key={subTab.id}
                  onClick={() => setExportSubTab(subTab.id as ExportSubTab)}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    exportSubTab === subTab.id
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <span className="mr-1">{subTab.icon}</span>
                  {subTab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="bg-gray-100 border-b">
          <div className="max-w-7xl mx-auto px-4">
            <nav className="flex space-x-2 py-2" aria-label="Sub-tabs">
              {settingsSubTabs.map((subTab) => (
                <button
                  key={subTab.id}
                  onClick={() => setSettingsSubTab(subTab.id as SettingsSubTab)}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    settingsSubTab === subTab.id
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <span className="mr-1">{subTab.icon}</span>
                  {subTab.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4">
        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Status Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">System Status</h2>
                <button
                  onClick={refreshData}
                  disabled={loading}
                  className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                >
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              {dbStatus === 'checking' && (
                <div className="flex items-center text-blue-600">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
                  <span>Initializing database...</span>
                </div>
              )}

              {dbStatus === 'ready' && (
                <div className="space-y-4">
                  <div className="flex items-center text-green-600">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-medium">Database initialized successfully</span>
                  </div>

                  <div className="grid grid-cols-5 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4 cursor-pointer hover:bg-blue-100 transition-colors" onClick={() => setActiveTab('dashboard')}>
                      <div className="text-2xl font-bold text-blue-700">{stats.customers}</div>
                      <div className="text-sm text-blue-600">Customers</div>
                    </div>
                    <div className="bg-indigo-50 rounded-lg p-4 cursor-pointer hover:bg-indigo-100 transition-colors" onClick={() => setActiveTab('transactions')}>
                      <div className="text-2xl font-bold text-indigo-700">{stats.transactions}</div>
                      <div className="text-sm text-indigo-600">Invoices Staged</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 cursor-pointer hover:bg-green-100 transition-colors" onClick={() => setActiveTab('services')}>
                      <div className="text-2xl font-bold text-green-700">{stats.mappings}</div>
                      <div className="text-sm text-green-600">Service Mappings</div>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-4 cursor-pointer hover:bg-orange-100 transition-colors" onClick={() => setActiveTab('payments')}>
                      <div className="text-2xl font-bold text-orange-700">{stats.paymentTypes}</div>
                      <div className="text-sm text-orange-600">Payment Types</div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4 cursor-pointer hover:bg-purple-100 transition-colors" onClick={() => setActiveTab('audit')}>
                      <div className="text-2xl font-bold text-purple-700">{stats.logs}</div>
                      <div className="text-sm text-purple-600">Audit Logs</div>
                    </div>
                  </div>
                </div>
              )}

              {dbStatus === 'error' && (
                <div className="flex items-center text-red-600">
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Database initialization failed</span>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={handleEMRUpload}
                  disabled={processing}
                  className="p-4 border rounded-lg hover:bg-blue-50 text-left transition-colors disabled:opacity-50"
                >
                  <div className="text-2xl mb-2">📤</div>
                  <div className="font-medium">{processing ? 'Processing...' : 'Upload EMR File'}</div>
                  <div className="text-sm text-gray-500">Import transactions</div>
                </button>
                <button
                  onClick={handleCCUpload}
                  disabled={ccProcessing}
                  className="p-4 border rounded-lg hover:bg-purple-50 text-left transition-colors disabled:opacity-50"
                >
                  <div className="text-2xl mb-2">💳</div>
                  <div className="font-medium">{ccProcessing ? 'Processing...' : 'Upload CC Statement'}</div>
                  <div className="text-sm text-gray-500">Import expenses</div>
                </button>
                <button
                  onClick={() => setActiveTab('export')}
                  className="p-4 border rounded-lg hover:bg-green-50 text-left transition-colors"
                >
                  <div className="text-2xl mb-2">📥</div>
                  <div className="font-medium">Export to Transaction Pro</div>
                  <div className="text-sm text-gray-500">Generate QB import files</div>
                </button>
              </div>

              {/* Processing Result */}
              {processingResult && (
                <div className={`mt-4 p-4 rounded-lg ${processingResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  {processingResult.success ? (
                    <div>
                      <div className="font-medium text-green-700 mb-2">EMR File Processed Successfully!</div>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div><span className="text-gray-600">Total Rows:</span> <span className="font-medium">{processingResult.stats.totalRows}</span></div>
                        <div><span className="text-gray-600">Invoices:</span> <span className="font-medium">{processingResult.stats.invoiceCount}</span></div>
                        <div><span className="text-gray-600">Service Lines:</span> <span className="font-medium">{processingResult.stats.serviceLines}</span></div>
                        <div><span className="text-gray-600">Payment Lines:</span> <span className="font-medium">{processingResult.stats.paymentLines}</span></div>
                      </div>
                      {processingResult.stats.unmappedServices?.length > 0 && (
                        <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                          <div className="text-sm font-medium text-yellow-700">Unmapped Services ({processingResult.stats.unmappedServices.length}):</div>
                          <div className="text-xs text-yellow-600 mt-1 max-h-20 overflow-y-auto">
                            {processingResult.stats.unmappedServices.slice(0, 10).join(', ')}
                            {processingResult.stats.unmappedServices.length > 10 && ` ...and ${processingResult.stats.unmappedServices.length - 10} more`}
                          </div>
                        </div>
                      )}
                      {processingResult.stats.unmappedPaymentTypes?.length > 0 && (
                        <div className="mt-2 p-2 bg-yellow-50 rounded border border-yellow-200">
                          <div className="text-sm font-medium text-yellow-700">Unmapped Payment Types ({processingResult.stats.unmappedPaymentTypes.length}):</div>
                          <div className="text-xs text-yellow-600 mt-1">
                            {processingResult.stats.unmappedPaymentTypes.join(', ')}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-red-700">
                      <span className="font-medium">Error:</span> {processingResult.error}
                    </div>
                  )}
                </div>
              )}

              {/* CC Processing Result */}
              {ccResult && (
                <div className={`mt-4 p-4 rounded-lg ${ccResult.success ? 'bg-purple-50 border border-purple-200' : 'bg-red-50 border border-red-200'}`}>
                  {ccResult.success ? (
                    <div>
                      <div className="font-medium text-purple-700 mb-2">CC Statement Processed Successfully!</div>
                      <div className="grid grid-cols-4 gap-4 text-sm">
                        <div><span className="text-gray-600">Total Rows:</span> <span className="font-medium">{ccResult.stats.totalRows}</span></div>
                        <div><span className="text-gray-600">Expenses:</span> <span className="font-medium">{ccResult.stats.expenseCount}</span></div>
                        <div><span className="text-gray-600">Credits:</span> <span className="font-medium">{ccResult.stats.creditCount}</span></div>
                        <div><span className="text-gray-600">Categorized:</span> <span className="font-medium">{ccResult.stats.categorizedCount}</span></div>
                      </div>
                      {ccResult.stats.uncategorizedMerchants?.length > 0 && (
                        <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                          <div className="text-sm font-medium text-yellow-700">Uncategorized Merchants ({ccResult.stats.uncategorizedMerchants.length}):</div>
                          <div className="text-xs text-yellow-600 mt-1 max-h-20 overflow-y-auto">
                            {ccResult.stats.uncategorizedMerchants.slice(0, 10).join(', ')}
                            {ccResult.stats.uncategorizedMerchants.length > 10 && ` ...and ${ccResult.stats.uncategorizedMerchants.length - 10} more`}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-red-700">
                      <span className="font-medium">Error:</span> {ccResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Backup/Restore */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Data Management</h2>
              <div className="flex gap-4">
                <button
                  onClick={handleBackupExport}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm transition-colors"
                >
                  Export Backup
                </button>
                <button
                  onClick={handleBackupImport}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm transition-colors"
                >
                  Restore Backup
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">Export your database to a file or restore from a previous backup</p>
            </div>

            {/* Recent Uploads */}
            {uploads.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Recent Uploads</h2>
                <div className="space-y-2">
                  {uploads.slice(0, 5).map((upload: any, index: number) => (
                    <div key={upload.id || index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <span className={`w-2 h-2 rounded-full mr-3 ${
                          upload.status === 'processed' ? 'bg-green-500' :
                          upload.status === 'processing' ? 'bg-yellow-500' :
                          upload.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                        }`}></span>
                        <div>
                          <div className="font-medium text-sm">{upload.filename}</div>
                          <div className="text-xs text-gray-500">{upload.row_count} rows - {upload.file_type}</div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {upload.uploaded_at ? new Date(upload.uploaded_at).toLocaleString() : '-'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upload Tab - EMR Transactions Sub-Tab */}
        {activeTab === 'upload' && uploadSubTab === 'emr' && (
          <div className="space-y-4">
            {/* Flagged Transactions Section */}
            {flaggedTransactions.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg shadow">
                <div className="p-4 border-b border-yellow-200 bg-yellow-100">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <h3 className="text-md font-semibold text-yellow-800">
                        Transactions Needing Review ({flaggedTransactions.length})
                      </h3>
                      <p className="text-sm text-yellow-700">Potential duplicate customers detected - please review and resolve</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  {flaggedTransactions.map((flagged) => (
                    <div key={flagged.id} className="bg-white border border-yellow-300 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-semibold text-lg text-gray-900">{flagged.customer_name || 'Unknown'}</div>
                          <div className="text-sm text-gray-600">
                            EMR Patient ID: {flagged.emr_patient_id} | Invoice: {flagged.invoice_number} | Date: {flagged.transaction_date}
                          </div>
                          {flagged.service_name && (
                            <div className="text-sm text-gray-500 mt-1">Service: {flagged.service_name} - ${Number(flagged.amount || 0).toFixed(2)}</div>
                          )}
                        </div>
                      </div>

                      <div className="border-t pt-3 mt-3">
                        <div className="text-sm font-medium text-gray-700 mb-2">
                          Possible matches (same first name):
                        </div>
                        <div className="space-y-2">
                          {flagged.potential_matches && flagged.potential_matches.map((match: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded p-3">
                              <div className="flex-1">
                                <div className="font-medium text-gray-900">{match.emr_name}</div>
                                <div className="text-xs text-gray-600">
                                  EMR ID: {match.emr_patient_id}
                                  {match.qb_display_name && <span> | QB Name: {match.qb_display_name}</span>}
                                </div>
                              </div>
                              <button
                                onClick={() => handleLinkTransaction(flagged.id, match.customer_id)}
                                className="ml-3 px-3 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
                              >
                                Link to This Customer
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="border-t pt-3 mt-3 flex justify-end">
                        <button
                          onClick={() => handleCreateNewCustomer(flagged.id, flagged.emr_patient_id, flagged.customer_name)}
                          className="px-4 py-2 bg-green-500 text-white text-sm rounded hover:bg-green-600"
                        >
                          Create as New Customer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Staged Transactions Section */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-semibold">Staged Transactions</h2>
                  <p className="text-sm text-gray-500">EMR transactions ready for export</p>
                </div>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={txnSearch}
                  onChange={(e) => setTxnSearch(e.target.value)}
                  className="px-3 py-1.5 border rounded-md text-sm w-64"
                />
                <button
                  onClick={() => setShowUnmappedTxnOnly(!showUnmappedTxnOnly)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    showUnmappedTxnOnly
                      ? 'bg-red-100 text-red-700 border border-red-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {showUnmappedTxnOnly ? `Unmapped (${unmappedTxnCount})` : `Show Unmapped (${unmappedTxnCount})`}
                </button>
                <button
                  onClick={handleEMRUpload}
                  disabled={processing}
                  className="px-4 py-1.5 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Upload New'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium text-gray-600">Date</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-600">Invoice #</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-600">CID</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-600">Service/Product</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-600">Qty</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-600">Price</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-600">Amount</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-600">Payment</th>
                    <th className="px-3 py-3 text-center font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                        {txnSearch ? 'No matching transactions found' : 'No transactions staged. Upload an EMR file to get started.'}
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.slice(0, 100).map((txn, index) => (
                      <tr key={txn.id || index} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-500 text-xs font-mono">{txn.transaction_date}</td>
                        <td className="px-3 py-2 font-medium">{txn.invoice_number}</td>
                        <td className="px-3 py-2">{txn.customer_cid}</td>
                        <td className="px-3 py-2">
                          {txn.service_name ? (
                            <span className={txn.service_mapped ? '' : 'text-red-600'}>{txn.service_name}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">{txn.quantity || '-'}</td>
                        <td className="px-3 py-2 text-right">{txn.price ? `$${Number(txn.price).toFixed(2)}` : '-'}</td>
                        <td className="px-3 py-2 text-right font-medium">{txn.amount ? `$${Number(txn.amount).toFixed(2)}` : '-'}</td>
                        <td className="px-3 py-2">
                          {txn.payment_type ? (
                            <span className={`px-1.5 py-0.5 rounded text-xs ${txn.payment_mapped ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                              {txn.payment_type}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {txn.service_name && (
                            <span className={`inline-block w-2 h-2 rounded-full mr-1 ${txn.service_mapped ? 'bg-green-500' : 'bg-red-500'}`} title={txn.service_mapped ? 'Service Mapped' : 'Service Not Mapped'}></span>
                          )}
                          {txn.payment_type && (
                            <span className={`inline-block w-2 h-2 rounded-full ${txn.payment_mapped ? 'bg-green-500' : 'bg-red-500'}`} title={txn.payment_mapped ? 'Payment Mapped' : 'Payment Not Mapped'}></span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t text-sm text-gray-500 flex justify-between">
              <span>Showing {Math.min(filteredTransactions.length, 100)} of {filteredTransactions.length} transactions</span>
              <span className="text-xs">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span> Mapped
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 ml-3 mr-1"></span> Unmapped
              </span>
            </div>
            </div>
          </div>
        )}

        {/* Settings Tab - Customers Sub-Tab */}
        {activeTab === 'settings' && settingsSubTab === 'customers' && (
          <div className="space-y-4">
            {/* Edit Customer Modal */}
            {showEditCustomer && editingCustomer && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
                  <h3 className="text-lg font-semibold mb-4">Edit Customer Names</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">Customer UUID</label>
                      <input
                        type="text"
                        value={editingCustomer.customer_id}
                        disabled
                        className="w-full px-3 py-2 border rounded-md text-sm bg-gray-100 text-gray-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">EMR Patient ID</label>
                      <input
                        type="text"
                        value={editingCustomer.emr_patient_id}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, emr_patient_id: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="EMR Patient ID"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">EMR Name</label>
                      <input
                        type="text"
                        value={editingCustomer.emr_name}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, emr_name: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="Name from EMR system"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">QuickBooks Display Name *</label>
                      <input
                        type="text"
                        value={editingCustomer.qb_display_name}
                        onChange={(e) => setEditingCustomer({ ...editingCustomer, qb_display_name: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        placeholder="Name for QuickBooks export"
                      />
                      <p className="text-xs text-gray-500 mt-1">This name will be used when exporting to QuickBooks</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={handleSaveCustomer}
                      disabled={savingCustomer || !editingCustomer.qb_display_name}
                      className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 disabled:opacity-50"
                    >
                      {savingCustomer ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      onClick={() => { setShowEditCustomer(false); setEditingCustomer(null); }}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Import Crosswalk Card */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold">Customer Crosswalk</h3>
                  <p className="text-sm text-gray-500">Import customer ID mappings from Excel</p>
                </div>
                <button
                  onClick={handleImportCrosswalk}
                  disabled={importingCrosswalk}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 disabled:opacity-50"
                >
                  {importingCrosswalk ? 'Importing...' : 'Import Crosswalk'}
                </button>
              </div>

              {crosswalkResult && (
                <div className={`mt-3 p-3 rounded-lg text-sm ${crosswalkResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {crosswalkResult.success
                    ? `Imported ${crosswalkResult.customersImported} customers and ${crosswalkResult.mappingsImported} mappings`
                    : `Error: ${crosswalkResult.error}`}
                </div>
              )}
            </div>

            {/* Customers Table */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-semibold">Customer Registry</h2>
                  <p className="text-sm text-gray-500">EMR CID to QuickBooks customer mapping</p>
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Search customers..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="px-3 py-1.5 border rounded-md text-sm w-64"
                  />
                  <button
                    onClick={() => setShowUnmappedCustomersOnly(!showUnmappedCustomersOnly)}
                    className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                      showUnmappedCustomersOnly
                        ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {showUnmappedCustomersOnly ? `Unmapped (${unmappedCustomerCount})` : `Show Unmapped (${unmappedCustomerCount})`}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Customer UUID</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">EMR Patient ID</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">EMR Name</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">QuickBooks Name</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                      <th className="px-4 py-3 text-center font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                          {customerSearch ? 'No matching customers found' : 'No customers loaded. Import a crosswalk file or upload EMR transactions.'}
                        </td>
                      </tr>
                    ) : (
                      filteredCustomers.slice(0, 100).map((customer, index) => (
                        <tr key={customer.customer_id || index} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs" title={customer.customer_id}>
                            {customer.customer_id ? customer.customer_id.substring(0, 8) + '...' : '-'}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{customer.emr_patient_id || <span className="text-gray-400">-</span>}</td>
                          <td className="px-4 py-3">{customer.emr_name || <span className="text-gray-400">-</span>}</td>
                          <td className="px-4 py-3">
                            {customer.qb_display_name ? (
                              <span className="text-blue-600">{customer.qb_display_name}</span>
                            ) : (
                              <span className="text-yellow-600 text-xs">Not mapped</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {customer.qb_display_name ? (
                              <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Mapped to QB"></span>
                            ) : (
                              <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" title="Needs QB mapping"></span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleEditCustomer(customer)}
                              className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="p-3 border-t text-sm text-gray-500 flex justify-between">
                <span>Showing {Math.min(filteredCustomers.length, 100)} of {filteredCustomers.length} customers</span>
                <span className="text-xs">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span> QB Mapped
                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 ml-3 mr-1"></span> Needs Mapping
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab - Service Mappings Sub-Tab */}
        {activeTab === 'settings' && settingsSubTab === 'services' && (
          <div className="space-y-4">
            {/* Add Service Form */}
            {showAddService && (
              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="font-semibold mb-3">Add Service Mapping</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">EMR Service Name *</label>
                    <input
                      type="text"
                      value={newService.emr_service_name}
                      onChange={(e) => setNewService({ ...newService, emr_service_name: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="e.g., Botox 50 Units"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">QB Item Name *</label>
                    <input
                      type="text"
                      value={newService.qb_item_name}
                      onChange={(e) => setNewService({ ...newService, qb_item_name: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="e.g., Botox"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Income Account *</label>
                    <input
                      type="text"
                      value={newService.income_account}
                      onChange={(e) => setNewService({ ...newService, income_account: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="e.g., 4100 Revenue:Injectable Services"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Tax Code</label>
                    <select
                      value={newService.tax_code}
                      onChange={(e) => setNewService({ ...newService, tax_code: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    >
                      <option value="Non">Non-Taxable</option>
                      <option value="Tax">Taxable</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleAddServiceMapping}
                    disabled={addingMapping || !newService.emr_service_name || !newService.qb_item_name || !newService.income_account}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 disabled:opacity-50"
                  >
                    {addingMapping ? 'Adding...' : 'Add Mapping'}
                  </button>
                  <button
                    onClick={() => setShowAddService(false)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b flex justify-between items-center">
                <h2 className="text-lg font-semibold">Service Mappings</h2>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Search services..."
                    value={serviceSearch}
                    onChange={(e) => setServiceSearch(e.target.value)}
                    className="px-3 py-1.5 border rounded-md text-sm w-64"
                  />
                  <button
                    onClick={() => setShowAddService(true)}
                    className="px-3 py-1.5 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600"
                  >
                    + Add
                  </button>
                </div>
              </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">EMR Service</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">QB Item</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Income Account</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Asset Account</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Tax Code</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredServices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        {serviceSearch ? 'No matching services found' : 'No service mappings loaded'}
                      </td>
                    </tr>
                  ) : (
                    filteredServices.map((service, index) => (
                      <tr key={service.id || index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{service.emr_service_name}</td>
                        <td className="px-4 py-3 text-blue-600">{service.qb_item_name}</td>
                        <td className="px-4 py-3 text-gray-600">{service.income_account || '-'}</td>
                        <td className="px-4 py-3 text-gray-600">{service.asset_account || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            service.tax_code === 'Tax' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {service.tax_code || 'N/A'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
              <div className="p-3 border-t text-sm text-gray-500">
                Showing {filteredServices.length} of {serviceMappings.length} mappings
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab - Payment Types Sub-Tab */}
        {activeTab === 'settings' && settingsSubTab === 'payments' && (
          <div className="space-y-4">
            {/* Add Payment Type Form */}
            {showAddPayment && (
              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="font-semibold mb-3">Add Payment Type</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Payment Type *</label>
                    <input
                      type="text"
                      value={newPayment.payment_type}
                      onChange={(e) => setNewPayment({ ...newPayment, payment_type: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="e.g., Client Bank"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Category *</label>
                    <select
                      value={newPayment.category}
                      onChange={(e) => setNewPayment({ ...newPayment, category: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    >
                      <option value="Merchant">Merchant</option>
                      <option value="Vendor Receivable">Vendor Receivable</option>
                      <option value="Cash">Cash</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Clearing Account *</label>
                    <input
                      type="text"
                      value={newPayment.clearing_account}
                      onChange={(e) => setNewPayment({ ...newPayment, clearing_account: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="e.g., 1030 Merchant Clearing"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleAddPaymentType}
                    disabled={addingMapping || !newPayment.payment_type || !newPayment.category || !newPayment.clearing_account}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 disabled:opacity-50"
                  >
                    {addingMapping ? 'Adding...' : 'Add Payment Type'}
                  </button>
                  <button
                    onClick={() => setShowAddPayment(false)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b flex justify-between items-center">
                <h2 className="text-lg font-semibold">Payment Type Mappings</h2>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Search payment types..."
                    value={paymentSearch}
                    onChange={(e) => setPaymentSearch(e.target.value)}
                    className="px-3 py-1.5 border rounded-md text-sm w-64"
                  />
                  <button
                    onClick={() => setShowAddPayment(true)}
                    className="px-3 py-1.5 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600"
                  >
                    + Add
                  </button>
                </div>
              </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Payment Type</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Category</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Clearing Account</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredPayments.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                        {paymentSearch ? 'No matching payment types found' : 'No payment type mappings loaded'}
                      </td>
                    </tr>
                  ) : (
                    filteredPayments.map((payment, index) => (
                      <tr key={payment.id || index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{payment.payment_type}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            payment.category?.toLowerCase().includes('vendor')
                              ? 'bg-purple-100 text-purple-700'
                              : payment.category?.toLowerCase().includes('merchant')
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {payment.category || 'N/A'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">{payment.clearing_account}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
              <div className="p-3 border-t text-sm text-gray-500">
                Showing {filteredPayments.length} of {paymentTypes.length} payment types
              </div>
            </div>
          </div>
        )}

        {/* Export Tab - Transaction Pro Sub-Tab */}
        {activeTab === 'export' && exportSubTab === 'transaction-pro' && (
          <div className="space-y-4">
            {/* Export Preview Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Export to Transaction Pro</h2>
              <p className="text-gray-600 mb-4">
                Generate CSV files for importing invoices and payments into QuickBooks via Transaction Pro.
              </p>

              {exportPreview && (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-700">{exportPreview.invoiceLines}</div>
                    <div className="text-sm text-blue-600">Invoice Lines</div>
                    <div className="text-xs text-blue-500 mt-1">Service items to export</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-700">{exportPreview.paymentLines}</div>
                    <div className="text-sm text-green-600">Payment Lines</div>
                    <div className="text-xs text-green-500 mt-1">Receive payments to export</div>
                  </div>
                </div>
              )}

              {/* Unmapped Warnings */}
              {exportPreview?.unmappedServices?.length > 0 && (
                <div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div className="font-medium text-yellow-700 text-sm">
                    Unmapped Services ({exportPreview.unmappedServices.length})
                  </div>
                  <div className="text-xs text-yellow-600 mt-1">
                    {exportPreview.unmappedServices.slice(0, 5).join(', ')}
                    {exportPreview.unmappedServices.length > 5 && ` ...and ${exportPreview.unmappedServices.length - 5} more`}
                  </div>
                </div>
              )}

              {exportPreview?.unmappedPayments?.length > 0 && (
                <div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div className="font-medium text-yellow-700 text-sm">
                    Unmapped Payment Types ({exportPreview.unmappedPayments.length})
                  </div>
                  <div className="text-xs text-yellow-600 mt-1">
                    {exportPreview.unmappedPayments.join(', ')}
                  </div>
                </div>
              )}

              <button
                onClick={handleExport}
                disabled={exporting || !exportPreview || (exportPreview.invoiceLines === 0 && exportPreview.paymentLines === 0)}
                className="px-6 py-3 bg-blue-500 text-white rounded-md font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting ? 'Exporting...' : 'Export to CSV'}
              </button>

              {/* Export Result */}
              {exportResult && (
                <div className={`mt-4 p-4 rounded-lg ${exportResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  {exportResult.success ? (
                    <div>
                      <div className="font-medium text-green-700 mb-2">Export Successful!</div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Invoices exported:</span>{' '}
                          <span className="font-medium">{exportResult.invoicesExported}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Payments exported:</span>{' '}
                          <span className="font-medium">{exportResult.paymentsExported}</span>
                        </div>
                      </div>
                      {exportResult.invoiceFilePath && (
                        <div className="mt-2 text-xs text-gray-500">
                          Invoice file: <code className="bg-gray-100 px-1 rounded">{exportResult.invoiceFilePath}</code>
                        </div>
                      )}
                      {exportResult.paymentsFilePath && (
                        <div className="mt-1 text-xs text-gray-500">
                          Payments file: <code className="bg-gray-100 px-1 rounded">{exportResult.paymentsFilePath}</code>
                        </div>
                      )}
                      {exportResult.warnings?.length > 0 && (
                        <div className="mt-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                          <div className="text-sm font-medium text-yellow-700">Warnings ({exportResult.warnings.length}):</div>
                          <div className="text-xs text-yellow-600 mt-1 max-h-24 overflow-y-auto">
                            {exportResult.warnings.slice(0, 10).map((w: string, i: number) => (
                              <div key={i}>{w}</div>
                            ))}
                            {exportResult.warnings.length > 10 && <div>...and {exportResult.warnings.length - 10} more</div>}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-red-700">
                      <span className="font-medium">Error:</span> {exportResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Export Instructions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="font-semibold mb-3">How to Import into QuickBooks</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
                <li>Export the CSV files using the button above</li>
                <li>Open Transaction Pro Importer in QuickBooks Desktop</li>
                <li>Import the <strong>invoices</strong> file first (creates customer invoices)</li>
                <li>Then import the <strong>payments</strong> file (applies payments to invoices)</li>
                <li>Verify the imported transactions in QuickBooks</li>
              </ol>
            </div>
          </div>
        )}

        {/* Upload Tab - Credit Card Expenses Sub-Tab */}
        {activeTab === 'upload' && uploadSubTab === 'expenses' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Expense Transactions</h2>
                <p className="text-sm text-gray-500">CC statement transactions</p>
              </div>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Search expenses..."
                  value={expenseSearch}
                  onChange={(e) => setExpenseSearch(e.target.value)}
                  className="px-3 py-1.5 border rounded-md text-sm w-64"
                />
                <button
                  onClick={handleCCUpload}
                  disabled={ccProcessing}
                  className="px-4 py-1.5 bg-purple-500 text-white rounded-md text-sm hover:bg-purple-600 disabled:opacity-50"
                >
                  {ccProcessing ? 'Processing...' : 'Upload Statement'}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Merchant</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Category</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">Amount</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Account</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {expenses.filter(e =>
                    !expenseSearch ||
                    e.merchant?.toLowerCase().includes(expenseSearch.toLowerCase()) ||
                    e.category_name?.toLowerCase().includes(expenseSearch.toLowerCase())
                  ).slice(0, 100).map((expense, index) => (
                    <tr key={expense.id || index} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">{expense.transaction_date}</td>
                      <td className="px-4 py-3">{expense.merchant || '-'}</td>
                      <td className="px-4 py-3">
                        {expense.category_name ? (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">{expense.category_name}</span>
                        ) : (
                          <span className="text-yellow-600 text-xs">Uncategorized</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${expense.amount < 0 ? 'text-green-600' : ''}`}>
                        {expense.amount < 0 ? '-' : ''}${Math.abs(expense.amount || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{expense.expense_account || '-'}</td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        No expense transactions. Upload a CC statement to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t text-sm text-gray-500">
              Showing {Math.min(expenses.length, 100)} of {expenses.length} expenses
            </div>
          </div>
        )}

        {/* Review Tab - Payment Matching Sub-Tab */}
        {activeTab === 'review' && reviewSubTab === 'payment-matching' && (
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Gravity Payment Matching</h2>
                <div className="flex gap-2">
                  <button
                    onClick={handleGravityUpload}
                    disabled={gravityProcessing}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
                  >
                    {gravityProcessing ? 'Processing...' : 'Upload Gravity File'}
                  </button>
                  <button
                    onClick={handleMatchPayments}
                    disabled={matching || !gravitySummary || gravitySummary.totalPayments === 0}
                    className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"
                  >
                    {matching ? 'Matching...' : 'Match Payments'}
                  </button>
                  <button
                    onClick={handleGravityExport}
                    disabled={exporting || !gravitySummary || gravitySummary.matchedCount === 0}
                    className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50"
                  >
                    {exporting ? 'Exporting...' : 'Export Payments'}
                  </button>
                </div>
              </div>

              {/* Summary Statistics */}
              {gravitySummary && (
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-700">{gravitySummary.totalPayments}</div>
                    <div className="text-sm text-blue-600">Total Payments</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-700">${(gravitySummary.totalAmount || 0).toFixed(2)}</div>
                    <div className="text-sm text-green-600">Total Amount</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-purple-700">{gravitySummary.matchedCount}</div>
                    <div className="text-sm text-purple-600">Matched</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-orange-700">{gravitySummary.unmatchedCount}</div>
                    <div className="text-sm text-orange-600">Unmatched</div>
                  </div>
                </div>
              )}

              {!gravitySummary && (
                <div className="text-center py-8 text-gray-500">
                  No Gravity payments loaded. Upload a Gravity payments file to get started.
                </div>
              )}

              {/* Processing Result */}
              {gravityResult && (
                <div className={`mt-4 p-4 rounded-lg ${gravityResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  {gravityResult.success ? (
                    <div className="text-green-800">
                      <div className="font-medium mb-1">File processed successfully!</div>
                      <div className="text-sm">
                        Processed {gravityResult.stats?.paymentCount} payments totaling ${(gravityResult.stats?.totalAmount || 0).toFixed(2)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-red-800">
                      <div className="font-medium">Error:</div>
                      <div className="text-sm">{gravityResult.error}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Matching Result */}
              {matchResult && (
                <div className={`mt-4 p-4 rounded-lg ${matchResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  {matchResult.success ? (
                    <div className="text-green-800">
                      <div className="font-medium mb-1">Matching complete!</div>
                      <div className="text-sm">
                        Matched {matchResult.matchCount} payments, {matchResult.unmatchedCount} remain unmatched
                      </div>
                    </div>
                  ) : (
                    <div className="text-red-800">
                      <div className="font-medium">Error:</div>
                      <div className="text-sm">{matchResult.error}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Export Result */}
              {exportResult && (
                <div className={`mt-4 p-4 rounded-lg ${exportResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  {exportResult.success ? (
                    <div className="text-green-800">
                      <div className="font-medium mb-1">Export complete!</div>
                      <div className="text-sm">
                        Exported {exportResult.paymentsExported} payments to: {exportResult.filePath}
                      </div>
                    </div>
                  ) : (
                    <div className="text-red-800">
                      <div className="font-medium">Error:</div>
                      <div className="text-sm">{exportResult.error}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Matched Payments Table */}
            {gravityMatches && gravityMatches.length > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-4 border-b">
                  <h3 className="text-lg font-semibold">Matched Payments</h3>
                  <p className="text-sm text-gray-500">Payments matched to EMR invoices</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Invoice #</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Customer</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Amount</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Card Type</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Confidence</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {gravityMatches.map((match, index) => (
                        <tr key={match.id || index} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-500 text-xs font-mono">{match.gravity_date}</td>
                          <td className="px-4 py-3 font-medium">{match.invoice_number}</td>
                          <td className="px-4 py-3">{match.customer_name || match.customer_cid}</td>
                          <td className="px-4 py-3 text-right font-medium">${(match.amount || 0).toFixed(2)}</td>
                          <td className="px-4 py-3">{match.card_type || '-'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              match.match_confidence === 'exact'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              {match.match_confidence}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded text-xs ${
                              match.status === 'approved' ? 'bg-green-100 text-green-700' :
                              match.status === 'rejected' ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {match.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {match.status === 'pending' && (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleApproveMatch(match.id)}
                                  className="px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleRejectMatch(match.id)}
                                  className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 border-t text-sm text-gray-500">
                  Showing {gravityMatches.length} matched payments
                </div>
              </div>
            )}

            {/* Unmatched Payments Table */}
            {gravityTransactions && gravityTransactions.filter(t => !gravityMatches.find(m => m.gravity_payment_id === t.id)).length > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-4 border-b">
                  <h3 className="text-lg font-semibold">Unmatched Payments</h3>
                  <p className="text-sm text-gray-500">Payments that could not be auto-matched</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Approval Code</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Amount</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Card Type</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {gravityTransactions.filter(t => !gravityMatches.find(m => m.gravity_payment_id === t.id)).map((payment, index) => (
                        <tr key={payment.id || index} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-500 text-xs font-mono">{payment.transaction_date}</td>
                          <td className="px-4 py-3 font-mono text-xs">{payment.approval_code || '-'}</td>
                          <td className="px-4 py-3 text-right font-medium">${(payment.total_amount || 0).toFixed(2)}</td>
                          <td className="px-4 py-3">{payment.card_type || '-'}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{payment.source || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 border-t text-sm text-gray-500">
                  Showing {gravityTransactions.filter(t => !gravityMatches.find(m => m.gravity_payment_id === t.id)).length} unmatched payments
                </div>
              </div>
            )}
          </div>
        )}

        {/* Export Tab - Reports Sub-Tab */}
        {activeTab === 'export' && exportSubTab === 'reports' && (
          <div className="space-y-4">
            {/* Report Type Selector */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setReportType('customers')}
                  className={`px-4 py-2 rounded-md text-sm transition-colors ${
                    reportType === 'customers' ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  Customer Summary
                </button>
                <button
                  onClick={() => setReportType('services')}
                  className={`px-4 py-2 rounded-md text-sm transition-colors ${
                    reportType === 'services' ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  Service Breakdown
                </button>
                <button
                  onClick={() => setReportType('expenses')}
                  className={`px-4 py-2 rounded-md text-sm transition-colors ${
                    reportType === 'expenses' ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  Expense Summary
                </button>
              </div>
            </div>

            {/* Report Data */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-4 border-b">
                <h2 className="text-lg font-semibold">
                  {reportType === 'customers' ? 'Customer Summary' :
                   reportType === 'services' ? 'Service Breakdown' : 'Expense Summary'}
                </h2>
              </div>
              {loadingReport ? (
                <div className="p-8 text-center text-gray-500">Loading report...</div>
              ) : (
                <div className="overflow-x-auto">
                  {reportType === 'customers' && (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Customer</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600">Invoices</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600">Total Revenue</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">First Transaction</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Last Transaction</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(reportData || []).map((row: any, index: number) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{row.customerName}</td>
                            <td className="px-4 py-3 text-right">{row.invoiceCount}</td>
                            <td className="px-4 py-3 text-right font-medium text-green-600">${(row.totalRevenue || 0).toFixed(2)}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{row.firstTransaction}</td>
                            <td className="px-4 py-3 text-gray-500 text-xs">{row.lastTransaction}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {reportType === 'services' && (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Service</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">QB Item</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600">Usage Count</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600">Total Revenue</th>
                          <th className="px-4 py-3 text-center font-medium text-gray-600">Mapped</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(reportData || []).map((row: any, index: number) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{row.serviceName}</td>
                            <td className="px-4 py-3 text-blue-600">{row.qbItemName || '-'}</td>
                            <td className="px-4 py-3 text-right">{row.usageCount}</td>
                            <td className="px-4 py-3 text-right font-medium text-green-600">${(row.totalRevenue || 0).toFixed(2)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-block w-2 h-2 rounded-full ${row.isMapped ? 'bg-green-500' : 'bg-red-500'}`}></span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {reportType === 'expenses' && (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Category</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Account</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600">Transactions</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600">Total Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(reportData || []).map((row: any, index: number) => (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{row.category}</td>
                            <td className="px-4 py-3 text-gray-600">{row.expenseAccount || '-'}</td>
                            <td className="px-4 py-3 text-right">{row.transactionCount}</td>
                            <td className="px-4 py-3 text-right font-medium text-red-600">${(row.totalAmount || 0).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {(!reportData || reportData.length === 0) && (
                    <div className="p-8 text-center text-gray-500">No data available for this report</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Settings Tab - Audit Log Sub-Tab */}
        {activeTab === 'settings' && settingsSubTab === 'audit' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">Audit Log</h2>
              <button
                onClick={refreshData}
                disabled={loading}
                className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Timestamp</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Action</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Entity Type</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                        No audit logs yet
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log, index) => (
                      <tr key={log.id || index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                          {log.timestamp ? new Date(log.timestamp).toLocaleString() : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            log.action?.includes('create') || log.action?.includes('import') || log.action?.includes('processed')
                              ? 'bg-green-100 text-green-700'
                              : log.action?.includes('update')
                              ? 'bg-blue-100 text-blue-700'
                              : log.action?.includes('delete') || log.action?.includes('failed')
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{log.entity_type || '-'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-md truncate">
                          {log.details ? (
                            <span title={log.details}>{log.details.substring(0, 100)}...</span>
                          ) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t text-sm text-gray-500">
              Showing {auditLogs.length} log entries
            </div>
          </div>
        )}

        {/* Upload Tab - Gravity Payments Sub-Tab */}
        {activeTab === 'upload' && uploadSubTab === 'gravity' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center py-12">
              <div className="text-4xl mb-4">💳</div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">Gravity Payment Upload</h2>
              <p className="text-gray-600 mb-6">
                Upload Gravity payment CSV files and view staged payments before matching.
              </p>
              <p className="text-sm text-gray-500 bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-2xl mx-auto">
                <strong>Note:</strong> For now, use the <strong>Review → Payment Matching</strong> tab to upload Gravity files and match payments.
                This section will be enhanced to separate upload from matching workflow.
              </p>
            </div>
          </div>
        )}

        {/* Upload Tab - Bank Statement Sub-Tab */}
        {activeTab === 'upload' && uploadSubTab === 'bank' && (
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Bank Statement Processing</h2>
                <button
                  onClick={handleBankUpload}
                  disabled={bankProcessing}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50"
                >
                  {bankProcessing ? 'Processing...' : 'Upload Bank Statement'}
                </button>
              </div>

              {/* Upload Result */}
              {bankResult && (
                <div className={`mb-4 p-4 rounded-lg ${bankResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {bankResult.success ? (
                    <div>
                      <p className="font-medium">✓ Bank statement processed successfully!</p>
                      <p className="text-sm mt-1">
                        {bankResult.stats.totalRows} transactions imported: {bankResult.stats.deposits} deposits, {bankResult.stats.withdrawals} withdrawals, {bankResult.stats.fees} fees
                      </p>
                    </div>
                  ) : (
                    <p>✗ Error: {bankResult.error}</p>
                  )}
                </div>
              )}

              {/* Summary Statistics */}
              {bankSummary && (
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-700">{bankSummary.totalDeposits}</div>
                    <div className="text-sm text-blue-600">Total Deposits</div>
                    <div className="text-xs text-blue-500 mt-1">${(bankSummary.depositAmount || 0).toFixed(2)}</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-700">{bankSummary.totalWithdrawals}</div>
                    <div className="text-sm text-green-600">Withdrawals</div>
                    <div className="text-xs text-green-500 mt-1">${(bankSummary.withdrawalAmount || 0).toFixed(2)}</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-yellow-700">{bankSummary.totalFees}</div>
                    <div className="text-sm text-yellow-600">Fees</div>
                    <div className="text-xs text-yellow-500 mt-1">${(bankSummary.feeAmount || 0).toFixed(2)}</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-purple-700">{bankSummary.totalTransactions}</div>
                    <div className="text-sm text-purple-600">Total Transactions</div>
                  </div>
                </div>
              )}
            </div>

            {/* Deposits by Processor */}
            {depositsByProcessor.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Deposits by Processor</h3>
                <div className="grid grid-cols-4 gap-4">
                  {depositsByProcessor.map((proc, idx) => (
                    <div key={idx} className="border rounded-lg p-4">
                      <div className="text-xl font-bold text-gray-900">{proc.processor}</div>
                      <div className="text-sm text-gray-600">{proc.count} deposits</div>
                      <div className="text-lg font-medium text-green-600 mt-2">${(proc.total_amount || 0).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bank Statements Table */}
            {bankStatements.length > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-4 border-b">
                  <h3 className="text-lg font-semibold">Bank Transactions</h3>
                  <p className="text-sm text-gray-500">Recent transactions from uploaded bank statement</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-3 text-left font-medium text-gray-600">Date</th>
                        <th className="px-3 py-3 text-left font-medium text-gray-600">Description</th>
                        <th className="px-3 py-3 text-center font-medium text-gray-600">Type</th>
                        <th className="px-3 py-3 text-center font-medium text-gray-600">Processor</th>
                        <th className="px-3 py-3 text-right font-medium text-gray-600">Debit</th>
                        <th className="px-3 py-3 text-right font-medium text-gray-600">Credit</th>
                        <th className="px-3 py-3 text-center font-medium text-gray-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {bankStatements.slice(0, 50).map((stmt: any, index: number) => (
                        <tr key={stmt.id || index} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-500 text-xs font-mono">{stmt.transaction_date}</td>
                          <td className="px-3 py-2 text-xs">{(stmt.description || '').substring(0, 60)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              stmt.transaction_type === 'deposit' ? 'bg-green-100 text-green-700' :
                              stmt.transaction_type === 'withdrawal' ? 'bg-blue-100 text-blue-700' :
                              stmt.transaction_type === 'fee' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {stmt.transaction_type || 'other'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center text-xs">
                            {stmt.processor ? (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                                {stmt.processor}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-red-600">
                            {stmt.debit_amount > 0 ? `$${Number(stmt.debit_amount).toFixed(2)}` : '-'}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-green-600">
                            {stmt.credit_amount > 0 ? `$${Number(stmt.credit_amount).toFixed(2)}` : '-'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              stmt.reconciliation_status === 'reconciled' ? 'bg-green-100 text-green-700' :
                              stmt.reconciliation_status === 'matched' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {stmt.reconciliation_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 border-t text-sm text-gray-500">
                  Showing {Math.min(50, bankStatements.length)} of {bankStatements.length} transactions
                </div>
              </div>
            )}
          </div>
        )}

        {/* Review Tab - Bank Reconciliation Sub-Tab */}
        {activeTab === 'review' && reviewSubTab === 'bank-reconciliation' && (
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Bank Reconciliation</h2>
                <button
                  onClick={handleBankMatchDeposits}
                  disabled={bankMatching}
                  className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"
                >
                  {bankMatching ? 'Matching...' : 'Run Auto-Match'}
                </button>
              </div>

              {/* Match Result */}
              {bankMatchResult && (
                <div className={`mb-4 p-4 rounded-lg ${bankMatchResult.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                  {bankMatchResult.success ? (
                    <div>
                      <p className="font-medium">✓ Matching complete!</p>
                      <p className="text-sm mt-1">
                        {bankMatchResult.stats.totalDeposits} deposits processed: {bankMatchResult.stats.highConfidenceMatches} high confidence, {bankMatchResult.stats.mediumConfidenceMatches} medium confidence, {bankMatchResult.stats.lowConfidenceMatches} low confidence, {bankMatchResult.stats.unmatched} unmatched
                      </p>
                    </div>
                  ) : (
                    <p>✗ Error: {bankMatchResult.error}</p>
                  )}
                </div>
              )}

              {/* Summary Statistics */}
              {bankMatchSummary && (
                <div className="grid grid-cols-5 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-blue-700">{bankMatchSummary.totalMatches}</div>
                    <div className="text-sm text-blue-600">Total Matches</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-yellow-700">{bankMatchSummary.pendingMatches}</div>
                    <div className="text-sm text-yellow-600">Pending Review</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-green-700">{bankMatchSummary.approvedMatches}</div>
                    <div className="text-sm text-green-600">Approved</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-purple-700">${(bankMatchSummary.totalDepositAmount || 0).toFixed(2)}</div>
                    <div className="text-sm text-purple-600">Deposit Amount</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4">
                    <div className="text-2xl font-bold text-red-700">${(bankMatchSummary.totalMerchantFees || 0).toFixed(2)}</div>
                    <div className="text-sm text-red-600">Merchant Fees</div>
                  </div>
                </div>
              )}
            </div>

            {/* Deposit Matches Table */}
            {bankMatches.length > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-4 border-b">
                  <h3 className="text-lg font-semibold">Deposit Matches</h3>
                  <p className="text-sm text-gray-500">Review and approve bank deposit reconciliation matches</p>
                </div>
                <div className="divide-y">
                  {bankMatches.map((match: any) => (
                    <div key={match.id} className="p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                              match.match_confidence >= 90 ? 'bg-green-100 text-green-700' :
                              match.match_confidence >= 70 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-orange-100 text-orange-700'
                            }`}>
                              {match.match_confidence?.toFixed(0)}% Confidence
                            </span>
                            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                              {match.processor}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                              match.status === 'approved' ? 'bg-green-100 text-green-700' :
                              match.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {match.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <div className="text-gray-600">Deposit Date</div>
                              <div className="font-medium">{match.deposit_date}</div>
                            </div>
                            <div>
                              <div className="text-gray-600">Bank Description</div>
                              <div className="font-medium text-xs">{(match.bank_description || '').substring(0, 50)}</div>
                            </div>
                            <div>
                              <div className="text-gray-600">Bank Deposit Amount</div>
                              <div className="font-bold text-green-600 text-lg">${Number(match.bank_deposit_amount).toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-gray-600">Payment Batch Total</div>
                              <div className="font-bold text-blue-600 text-lg">${Number(match.payment_batch_total).toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-gray-600">Merchant Discount Fee</div>
                              <div className="font-bold text-red-600 text-lg">
                                ${Number(match.merchant_discount_fee).toFixed(2)}
                                <span className="text-sm ml-2">({Number(match.fee_percentage).toFixed(2)}%)</span>
                              </div>
                            </div>
                            <div>
                              <div className="text-gray-600">Payment Count</div>
                              <div className="font-medium">{match.payment_ids_array?.length || 0} payments</div>
                            </div>
                          </div>

                          {match.notes && (
                            <div className="mt-2 text-sm text-gray-600 bg-blue-50 p-2 rounded">
                              <strong>Match Reason:</strong> {match.notes}
                            </div>
                          )}
                        </div>

                        {match.status === 'pending' && (
                          <div className="flex gap-2 ml-4">
                            <button
                              onClick={() => handleApproveBankMatch(match.id)}
                              className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 text-sm"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectBankMatch(match.id)}
                              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-3 border-t text-sm text-gray-500">
                  Showing {bankMatches.length} matches
                </div>
              </div>
            )}

            {bankMatches.length === 0 && !bankMatching && (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <div className="text-4xl mb-4">🔍</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Matches Found</h3>
                <p className="text-gray-600 mb-4">
                  Click "Run Auto-Match" to automatically match bank deposits to payment batches.
                </p>
                <p className="text-sm text-gray-500">
                  Make sure you have uploaded both a bank statement and processed Gravity payments.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

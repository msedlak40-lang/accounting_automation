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
        updateQBName: (data: { cid: string; qbName: string; qbListId?: string }) =>
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
    };
  }
}

type TabType = 'dashboard' | 'transactions' | 'customers' | 'services' | 'payments' | 'export' | 'audit';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [dbStatus, setDbStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [stats, setStats] = useState({ customers: 0, mappings: 0, paymentTypes: 0, logs: 0, transactions: 0 });

  // Data for tables
  const [serviceMappings, setServiceMappings] = useState<any[]>([]);
  const [paymentTypes, setPaymentTypes] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [uploads, setUploads] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
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

  // Add mapping modal state
  const [showAddService, setShowAddService] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newService, setNewService] = useState({ emr_service_name: '', qb_item_name: '', income_account: '', tax_code: 'Non' });
  const [newPayment, setNewPayment] = useState({ payment_type: '', category: 'Merchant', clearing_account: '1030 Merchant Clearing' });
  const [addingMapping, setAddingMapping] = useState(false);

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

  // Load transactions when tab becomes active
  useEffect(() => {
    if (activeTab === 'transactions') {
      loadTransactions();
    }
    if (activeTab === 'customers') {
      loadCustomers();
    }
    if (activeTab === 'export') {
      loadExportPreview();
    }
  }, [activeTab]);

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
  const filteredTransactions = transactions.filter(t =>
    t.invoice_number?.toLowerCase().includes(txnSearch.toLowerCase()) ||
    t.customer_cid?.toLowerCase().includes(txnSearch.toLowerCase()) ||
    t.service_name?.toLowerCase().includes(txnSearch.toLowerCase()) ||
    t.payment_type?.toLowerCase().includes(txnSearch.toLowerCase())
  );

  // Filter customers (using new UUID-based schema fields)
  const filteredCustomers = customers.filter(c =>
    c.customer_id?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.emr_patient_id?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.emr_name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.qb_display_name?.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'transactions', label: `Transactions (${stats.transactions})`, icon: '📋' },
    { id: 'customers', label: `Customers (${stats.customers})`, icon: '👥' },
    { id: 'services', label: `Service Mappings (${stats.mappings})`, icon: '🔗' },
    { id: 'payments', label: `Payment Types (${stats.paymentTypes})`, icon: '💳' },
    { id: 'export', label: 'Export', icon: '📥' },
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
                <button className="p-4 border rounded-lg hover:bg-gray-50 text-left transition-colors opacity-50" disabled>
                  <div className="text-2xl mb-2">💳</div>
                  <div className="font-medium">Upload CC Statement</div>
                  <div className="text-sm text-gray-500">Coming soon</div>
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

        {/* Transactions Tab */}
        {activeTab === 'transactions' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Staged Transactions</h2>
                <p className="text-sm text-gray-500">EMR transactions ready for export</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search transactions..."
                  value={txnSearch}
                  onChange={(e) => setTxnSearch(e.target.value)}
                  className="px-3 py-1.5 border rounded-md text-sm w-64"
                />
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
        )}

        {/* Customers Tab */}
        {activeTab === 'customers' && (
          <div className="space-y-4">
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
                <input
                  type="text"
                  placeholder="Search customers..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="px-3 py-1.5 border rounded-md text-sm w-64"
                />
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
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredCustomers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
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

        {/* Service Mappings Tab */}
        {activeTab === 'services' && (
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

        {/* Payment Types Tab */}
        {activeTab === 'payments' && (
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

        {/* Export Tab */}
        {activeTab === 'export' && (
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

        {/* Audit Log Tab */}
        {activeTab === 'audit' && (
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
      </main>
    </div>
  );
}

export default App;

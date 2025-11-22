import { useState, useEffect } from 'react';

// Declare window.electronAPI type
declare global {
  interface Window {
    electronAPI: {
      customers: {
        getAll: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
      };
      serviceMappings: {
        getAll: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
      };
      paymentTypes: {
        getAll: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
      };
      audit: {
        getLogs: (options?: any) => Promise<{ success: boolean; data?: any[]; error?: string }>;
      };
      seed: {
        serviceMappings: (excelPath?: string) => Promise<{ success: boolean; count: number; error?: string }>;
        paymentTypeMappings: (excelPath?: string) => Promise<{ success: boolean; count: number; error?: string }>;
      };
    };
  }
}

type TabType = 'dashboard' | 'services' | 'payments' | 'audit';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [dbStatus, setDbStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [stats, setStats] = useState({ customers: 0, mappings: 0, paymentTypes: 0, logs: 0 });

  // Data for tables
  const [serviceMappings, setServiceMappings] = useState<any[]>([]);
  const [paymentTypes, setPaymentTypes] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Search/filter state
  const [serviceSearch, setServiceSearch] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');

  useEffect(() => {
    checkDatabase();
  }, []);

  const checkDatabase = async () => {
    try {
      const [customers, mappings, payments, logs] = await Promise.all([
        window.electronAPI.customers.getAll(),
        window.electronAPI.serviceMappings.getAll(),
        window.electronAPI.paymentTypes.getAll(),
        window.electronAPI.audit.getLogs({ limit: 100 }),
      ]);

      if (customers.success && mappings.success && payments.success && logs.success) {
        setStats({
          customers: customers.data?.length || 0,
          mappings: mappings.data?.length || 0,
          paymentTypes: payments.data?.length || 0,
          logs: logs.data?.length || 0,
        });
        setServiceMappings(mappings.data || []);
        setPaymentTypes(payments.data || []);
        setAuditLogs(logs.data || []);
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

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
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

                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4 cursor-pointer hover:bg-blue-100 transition-colors" onClick={() => setActiveTab('dashboard')}>
                      <div className="text-2xl font-bold text-blue-700">{stats.customers}</div>
                      <div className="text-sm text-blue-600">Customers</div>
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
                <button className="p-4 border rounded-lg hover:bg-gray-50 text-left transition-colors">
                  <div className="text-2xl mb-2">📤</div>
                  <div className="font-medium">Upload EMR File</div>
                  <div className="text-sm text-gray-500">Import transactions</div>
                </button>
                <button className="p-4 border rounded-lg hover:bg-gray-50 text-left transition-colors">
                  <div className="text-2xl mb-2">💳</div>
                  <div className="font-medium">Upload CC Statement</div>
                  <div className="text-sm text-gray-500">Capital One expenses</div>
                </button>
                <button className="p-4 border rounded-lg hover:bg-gray-50 text-left transition-colors">
                  <div className="text-2xl mb-2">📥</div>
                  <div className="font-medium">Export to Transaction Pro</div>
                  <div className="text-sm text-gray-500">Generate QB import</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Service Mappings Tab */}
        {activeTab === 'services' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">Service Mappings</h2>
              <input
                type="text"
                placeholder="Search services..."
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                className="px-3 py-1.5 border rounded-md text-sm w-64"
              />
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
        )}

        {/* Payment Types Tab */}
        {activeTab === 'payments' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">Payment Type Mappings</h2>
              <input
                type="text"
                placeholder="Search payment types..."
                value={paymentSearch}
                onChange={(e) => setPaymentSearch(e.target.value)}
                className="px-3 py-1.5 border rounded-md text-sm w-64"
              />
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
                            log.action?.includes('create') || log.action?.includes('import')
                              ? 'bg-green-100 text-green-700'
                              : log.action?.includes('update')
                              ? 'bg-blue-100 text-blue-700'
                              : log.action?.includes('delete')
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

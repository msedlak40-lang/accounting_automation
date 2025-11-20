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

function App() {
  const [dbStatus, setDbStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [stats, setStats] = useState({ customers: 0, mappings: 0, logs: 0 });
  const [seedStatus, setSeedStatus] = useState<{
    services: 'idle' | 'loading' | 'success' | 'error';
    payments: 'idle' | 'loading' | 'success' | 'error';
    servicesMessage?: string;
    paymentsMessage?: string;
  }>({
    services: 'idle',
    payments: 'idle',
  });

  useEffect(() => {
    // Test database connection
    const checkDatabase = async () => {
      try {
        const [customers, mappings, logs] = await Promise.all([
          window.electronAPI.customers.getAll(),
          window.electronAPI.serviceMappings.getAll(),
          window.electronAPI.audit.getLogs({ limit: 10 }),
        ]);

        if (customers.success && mappings.success && logs.success) {
          setStats({
            customers: customers.data?.length || 0,
            mappings: mappings.data?.length || 0,
            logs: logs.data?.length || 0,
          });
          setDbStatus('ready');
        } else {
          setDbStatus('error');
        }
      } catch (error) {
        console.error('Database check failed:', error);
        setDbStatus('error');
      }
    };

    checkDatabase();
  }, []);

  const refreshStats = async () => {
    const [customers, mappings, logs] = await Promise.all([
      window.electronAPI.customers.getAll(),
      window.electronAPI.serviceMappings.getAll(),
      window.electronAPI.audit.getLogs({ limit: 10 }),
    ]);
    setStats({
      customers: customers.data?.length || 0,
      mappings: mappings.data?.length || 0,
      logs: logs.data?.length || 0,
    });
  };

  const handleSeedServices = async () => {
    setSeedStatus(prev => ({ ...prev, services: 'loading', servicesMessage: undefined }));
    try {
      const result = await window.electronAPI.seed.serviceMappings();
      if (result.success) {
        setSeedStatus(prev => ({
          ...prev,
          services: 'success',
          servicesMessage: `Successfully imported ${result.count} service mappings!`,
        }));
        await refreshStats();
      } else {
        setSeedStatus(prev => ({
          ...prev,
          services: 'error',
          servicesMessage: result.error || 'Failed to import service mappings',
        }));
      }
    } catch (error: any) {
      setSeedStatus(prev => ({
        ...prev,
        services: 'error',
        servicesMessage: error.message || 'Failed to import service mappings',
      }));
    }
  };

  const handleSeedPayments = async () => {
    setSeedStatus(prev => ({ ...prev, payments: 'loading', paymentsMessage: undefined }));
    try {
      const result = await window.electronAPI.seed.paymentTypeMappings();
      if (result.success) {
        setSeedStatus(prev => ({
          ...prev,
          payments: 'success',
          paymentsMessage: `Successfully imported ${result.count} payment type mappings!`,
        }));
        await refreshStats();
      } else {
        setSeedStatus(prev => ({
          ...prev,
          payments: 'error',
          paymentsMessage: result.error || 'Failed to import payment type mappings',
        }));
      }
    } catch (error: any) {
      setSeedStatus(prev => ({
        ...prev,
        payments: 'error',
        paymentsMessage: error.message || 'Failed to import payment type mappings',
      }));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto py-6 px-4">
          <h1 className="text-3xl font-bold text-gray-900">
            Med Spa Accounting Automation
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-4">
        {/* Database Status Card */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">System Status</h2>

          {dbStatus === 'checking' && (
            <div className="flex items-center text-blue-600">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-3"></div>
              <span>Initializing database...</span>
            </div>
          )}

          {dbStatus === 'ready' && (
            <div className="space-y-3">
              <div className="flex items-center text-green-600">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-medium">Database initialized successfully</span>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-700">{stats.customers}</div>
                  <div className="text-sm text-blue-600">Customers</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-700">{stats.mappings}</div>
                  <div className="text-sm text-green-600">Service Mappings</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
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

        {/* Database Seeding Card */}
        {dbStatus === 'ready' && stats.mappings === 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Initialize Reference Data</h2>
            <p className="text-gray-600 mb-4">
              Import service mappings and payment type mappings from your Excel file to get started.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Service Mappings */}
              <div className="border rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">Service Mappings</h3>
                <p className="text-sm text-gray-500 mb-3">
                  Import EMR service to QuickBooks item mappings
                </p>
                <button
                  onClick={handleSeedServices}
                  disabled={seedStatus.services === 'loading' || seedStatus.services === 'success'}
                  className={`w-full px-4 py-2 rounded-md font-medium transition-colors ${
                    seedStatus.services === 'success'
                      ? 'bg-green-100 text-green-700 cursor-not-allowed'
                      : seedStatus.services === 'loading'
                      ? 'bg-blue-100 text-blue-700 cursor-wait'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {seedStatus.services === 'loading' && 'Importing...'}
                  {seedStatus.services === 'success' && '✓ Imported'}
                  {seedStatus.services === 'error' && 'Retry Import'}
                  {seedStatus.services === 'idle' && 'Import Service Mappings'}
                </button>
                {seedStatus.servicesMessage && (
                  <p className={`mt-2 text-sm ${
                    seedStatus.services === 'success' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {seedStatus.servicesMessage}
                  </p>
                )}
              </div>

              {/* Payment Type Mappings */}
              <div className="border rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-2">Payment Type Mappings</h3>
                <p className="text-sm text-gray-500 mb-3">
                  Import payment type to clearing account mappings
                </p>
                <button
                  onClick={handleSeedPayments}
                  disabled={seedStatus.payments === 'loading' || seedStatus.payments === 'success'}
                  className={`w-full px-4 py-2 rounded-md font-medium transition-colors ${
                    seedStatus.payments === 'success'
                      ? 'bg-green-100 text-green-700 cursor-not-allowed'
                      : seedStatus.payments === 'loading'
                      ? 'bg-blue-100 text-blue-700 cursor-wait'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {seedStatus.payments === 'loading' && 'Importing...'}
                  {seedStatus.payments === 'success' && '✓ Imported'}
                  {seedStatus.payments === 'error' && 'Retry Import'}
                  {seedStatus.payments === 'idle' && 'Import Payment Types'}
                </button>
                {seedStatus.paymentsMessage && (
                  <p className={`mt-2 text-sm ${
                    seedStatus.payments === 'success' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {seedStatus.paymentsMessage}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> This will import data from <code className="bg-yellow-100 px-1 rounded">data/raw/COA_Quickbooks_matched.xlsx</code>
              </p>
            </div>
          </div>
        )}

        {/* Welcome Card */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Welcome!</h2>
          <p className="text-gray-600 mb-4">
            Your Med Spa accounting automation system is ready. Here's what you can do:
          </p>

          <div className="space-y-3">
            <div className="flex items-start">
              <div className="bg-blue-100 rounded-full p-2 mr-3">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Upload EMR Transactions</h3>
                <p className="text-sm text-gray-500">Process revenue transactions and match customers automatically</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="bg-green-100 rounded-full p-2 mr-3">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Upload Credit Card Statements</h3>
                <p className="text-sm text-gray-500">Categorize expenses and generate journal entries</p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="bg-purple-100 rounded-full p-2 mr-3">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Export to Transaction Pro</h3>
                <p className="text-sm text-gray-500">Generate CSV files ready for QuickBooks import</p>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Next step:</strong> The full UI is under development. This screen confirms your database is initialized and ready!
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;

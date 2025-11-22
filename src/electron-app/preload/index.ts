import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script - exposes safe APIs to the renderer process
 * Uses contextBridge to securely expose IPC methods
 */

const api = {
  // Database queries
  dbQuery: (sql: string, params?: any[]) => ipcRenderer.invoke('db:query', sql, params),

  // Customers
  customers: {
    getAll: () => ipcRenderer.invoke('customers:getAll'),
    create: (customerData: any) => ipcRenderer.invoke('customers:create', customerData),
    getAllWithMappings: () => ipcRenderer.invoke('customers:getAllWithMappings'),
    getUnmappedEMR: () => ipcRenderer.invoke('customers:getUnmappedEMR'),
    getStats: () => ipcRenderer.invoke('customers:getStats'),
    importCrosswalk: (excelPath?: string) => ipcRenderer.invoke('customers:importCrosswalk', excelPath),
    selectCrosswalkFile: () => ipcRenderer.invoke('customers:selectCrosswalkFile'),
    updateNames: (data: {
      customer_id: string;
      qb_display_name?: string;
      emr_name?: string;
      emr_patient_id?: string;
    }) => ipcRenderer.invoke('customers:updateNames', data),
  },

  // Service mappings
  serviceMappings: {
    getAll: () => ipcRenderer.invoke('service-mappings:getAll'),
    create: (mappingData: any) => ipcRenderer.invoke('service-mappings:create', mappingData),
  },

  // Payment type mappings
  paymentTypes: {
    getAll: () => ipcRenderer.invoke('payment-types:getAll'),
    create: (mappingData: any) => ipcRenderer.invoke('payment-types:create', mappingData),
  },

  // Audit logs
  audit: {
    getLogs: (options?: { limit?: number; action?: string }) =>
      ipcRenderer.invoke('audit:getLogs', options),
  },

  // File operations
  file: {
    upload: (fileData: { path: string; type: string }) =>
      ipcRenderer.invoke('file:upload', fileData),
  },

  // EMR processing
  emr: {
    selectFile: () => ipcRenderer.invoke('emr:selectFile'),
    processFile: (filePath: string) => ipcRenderer.invoke('emr:processFile', filePath),
    getStagedTransactions: (options?: { uploadId?: string; limit?: number; offset?: number }) =>
      ipcRenderer.invoke('emr:getStagedTransactions', options),
    getSummary: (uploadId?: string) => ipcRenderer.invoke('emr:getSummary', uploadId),
    getUploads: () => ipcRenderer.invoke('emr:getUploads'),
  },

  // Database seeding
  seed: {
    serviceMappings: (excelPath?: string) =>
      ipcRenderer.invoke('seed:serviceMappings', excelPath),
    paymentTypeMappings: (excelPath?: string) =>
      ipcRenderer.invoke('seed:paymentTypeMappings', excelPath),
  },

  // Transaction Pro Export
  export: {
    selectDirectory: () => ipcRenderer.invoke('export:selectDirectory'),
    preview: (uploadId?: string) => ipcRenderer.invoke('export:preview', uploadId),
    transactionPro: (data: { outputDir: string; uploadId?: string }) =>
      ipcRenderer.invoke('export:transactionPro', data),
  },
};

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', api);

// TypeScript type declaration for window.electronAPI
export type ElectronAPI = typeof api;

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
  },

  // Service mappings
  serviceMappings: {
    getAll: () => ipcRenderer.invoke('service-mappings:getAll'),
    create: (mappingData: any) => ipcRenderer.invoke('service-mappings:create', mappingData),
  },

  // Payment type mappings
  paymentTypes: {
    getAll: () => ipcRenderer.invoke('payment-types:getAll'),
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
};

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', api);

// TypeScript type declaration for window.electronAPI
export type ElectronAPI = typeof api;

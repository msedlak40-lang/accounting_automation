import { app, BrowserWindow } from 'electron';
import path from 'path';
import { initializeDatabase, Database } from './database';
import { setupIpcHandlers } from './ipc-handlers';
import { registerPythonHandlers } from './python-handlers';

let mainWindow: BrowserWindow | null = null;
let db: Database | null = null;

// Get user data path for storing database
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'accounting.db');

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    title: 'Med Spa Accounting Automation',
    backgroundColor: '#ffffff',
  });

  // Load the index.html from the renderer
  // VITE_DEV_SERVER_URL is set by vite-plugin-electron in dev mode
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    // Production: renderer is built to dist/ folder (relative to electron-app root)
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize database and app
app.whenReady().then(async () => {
  try {
    // Initialize SQL.js database (async)
    db = await initializeDatabase(dbPath);
    console.log(`Database initialized at: ${dbPath}`);

    // Setup IPC handlers for renderer communication
    setupIpcHandlers(db, dbPath);

    // Register Python-powered handlers
    registerPythonHandlers(db);
    console.log('Python handlers registered');

    // Create main window
    createWindow();

    app.on('activate', () => {
      // On macOS, re-create window when dock icon is clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error('Failed to initialize app:', error);
    app.quit();
  }
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Export for use in other modules
export { db, dbPath };

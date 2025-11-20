import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import Database from 'better-sqlite3';
import { initializeDatabase } from './database';
import { setupIpcHandlers } from './ipc-handlers';

let mainWindow: BrowserWindow | null = null;
let db: Database.Database | null = null;

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
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize database and app
app.whenReady().then(() => {
  try {
    // Initialize SQLite database
    db = new Database(dbPath);
    console.log(`Database initialized at: ${dbPath}`);

    // Create tables and seed data
    initializeDatabase(db);

    // Setup IPC handlers for renderer communication
    setupIpcHandlers(db);

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
    if (db) {
      db.close();
    }
    app.quit();
  }
});

// Handle app termination
app.on('before-quit', () => {
  if (db) {
    db.close();
  }
});

// Export for use in other modules
export { db };

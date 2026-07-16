import { join } from 'node:path';
import Database from 'better-sqlite3';
import { app, BrowserWindow } from 'electron';
import { is } from '@electron-toolkit/utils';
import { discoverLcuConnection } from './lcu/discovery';
import { createLcuClient } from './lcu/http-client';
import { registerMatchIpc } from './ipc/register-match-ipc';
import { registerSettingsIpc } from './ipc/register-settings-ipc';
import { MatchService } from './match/match-service';
import { MatchCache, migrateDatabase } from './cache/database';
import { SettingsService } from './settings/settings-service';

let database: Database.Database | undefined;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(() => {
  database = new Database(join(app.getPath('userData'), 'lol-viewer.sqlite3'));
  migrateDatabase(database);
  const cache = new MatchCache(database);
  registerSettingsIpc(new SettingsService(database, cache));
  registerMatchIpc({
    async loadLiveMatch(scope, onPlayer) {
      const connection = await discoverLcuConnection();
      if (!connection) throw new Error('League client is unavailable');
      return new MatchService(createLcuClient(connection), { cache }).loadLiveMatch(scope, onPlayer);
    }
  });
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  database?.close();
  database = undefined;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

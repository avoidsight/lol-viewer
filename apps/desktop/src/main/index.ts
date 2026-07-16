import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { is } from '@electron-toolkit/utils';
import { discoverLcuConnection } from './lcu/discovery';
import { createLcuClient } from './lcu/http-client';
import { registerMatchIpc } from './ipc/register-match-ipc';
import { MatchService } from './match/match-service';

registerMatchIpc({
  async loadLiveMatch(scope, onPlayer) {
    const connection = await discoverLcuConnection();
    if (!connection) throw new Error('League client is unavailable');
    return new MatchService(createLcuClient(connection)).loadLiveMatch(scope, onPlayer);
  }
});

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
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

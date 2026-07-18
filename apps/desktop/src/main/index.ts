import { join } from 'node:path';
import Database from 'better-sqlite3';
import { app, BrowserWindow } from 'electron';
import { is } from '@electron-toolkit/utils';
import { discoverLcuConnection } from './lcu/discovery';
import { createLcuClient } from './lcu/http-client';
import { registerMatchIpc } from './ipc/register-match-ipc';
import { registerSettingsIpc } from './ipc/register-settings-ipc';
import { registerHistoryIpc } from './ipc/register-history-ipc';
import { MatchService } from './match/match-service';
import { ChampionGuideCache, MatchCache, migrateDatabase, PersonalHistoryCache } from './cache/database';
import { ChampionGuideClient } from './champions/champion-guide-client';
import { registerChampionIpc } from './ipc/register-champion-ipc';
import { SettingsService } from './settings/settings-service';
import { createFixtureLiveMatch, createFixturePersonalHistory, fixtureModeEnabled } from './fixtures/live-match';
import { z } from 'zod';
import { GameflowCoordinator } from './match/gameflow-coordinator';
import { PersonalHistoryService } from './history/personal-history-service';

let database: Database.Database | undefined;
let coordinator: GameflowCoordinator | undefined;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
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
  const fixtureMode = fixtureModeEnabled(process.argv, app.isPackaged, process.env);
  database = new Database(join(app.getPath('userData'), 'lol-viewer.sqlite3'));
  migrateDatabase(database);
  const cache = new MatchCache(database);
  const guideCache = new ChampionGuideCache(database);
  const personalHistoryCache = new PersonalHistoryCache(database);
  const patchSchema = z.string().regex(/^\d+\.\d+(?:\.\d+){0,2}$/);
  registerChampionIpc(new ChampionGuideClient({
    baseUrl: process.env.CHAMPION_GUIDE_SERVICE_URL ?? 'http://127.0.0.1:8787',
    ...(process.env.CHAMPION_GUIDE_PATCH ? { patch: process.env.CHAMPION_GUIDE_PATCH } : {
      getPatch: async () => {
        const connection = await discoverLcuConnection();
        if (!connection) throw new Error('League client is unavailable');
        const version = patchSchema.parse(await createLcuClient(connection).get('/lol-patch/v1/game-version', patchSchema));
        return version.split('.').slice(0, 2).join('.');
      }
    }), cache: guideCache
  }));
  registerSettingsIpc(new SettingsService(database, cache, guideCache, personalHistoryCache));
  registerHistoryIpc({
    load: async () => {
      if (fixtureMode) return createFixturePersonalHistory();
      const connection = await discoverLcuConnection();
      if (!connection) throw new Error('League client is unavailable');
      return new PersonalHistoryService(createLcuClient(connection), personalHistoryCache).load();
    }
  });
  coordinator = new GameflowCoordinator(async (scope, onPlayer) => {
      if (fixtureMode) return createFixtureLiveMatch(scope);
      const connection = await discoverLcuConnection();
      if (!connection) throw new Error('League client is unavailable');
      return new MatchService(createLcuClient(connection), { cache }).loadLiveMatch(scope, onPlayer);
  });
  registerMatchIpc(coordinator);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  coordinator?.dispose();
  coordinator = undefined;
  database?.close();
  database = undefined;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

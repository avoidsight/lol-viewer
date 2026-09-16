import { join } from 'node:path';
import { release } from 'node:os';
import { readFileSync } from 'node:fs';
import { registerFeedbackIpc } from './ipc/register-feedback-ipc';
import { createDeviceIdProvider } from './feedback/device-id';
import { FeedbackService, feedbackEndpoint } from './feedback/feedback-service';
import Database from 'better-sqlite3';
import { app, BrowserWindow, protocol, powerMonitor } from 'electron';
import { UsageReporter } from './telemetry/reporter';
import { is } from '@electron-toolkit/utils';
import appIcon from '../../resources/icon.png?asset';
import { discoverLcuConnection } from './lcu/discovery';
import { createLcuClient } from './lcu/http-client';
import { registerMatchIpc } from './ipc/register-match-ipc';
import { registerSettingsIpc } from './ipc/register-settings-ipc';
import { registerHistoryIpc } from './ipc/register-history-ipc';
import { MatchService } from './match/match-service';
import { ChampionGuideCache, MatchCache, migrateDatabase, PersonalHistoryCache } from './cache/database';
import { ChampionGuideClient } from './champions/champion-guide-client';
import { ChampionCatalogService } from './champions/champion-catalog-service';
import { getBundledGuide } from './champions/bundled-guide';
import { registerChampionIpc } from './ipc/register-champion-ipc';
import { SettingsService } from './settings/settings-service';
import { createFixtureAramLiveMatch, createFixtureLiveMatch, createFixturePersonalHistory, fixtureModeEnabled } from './fixtures/live-match';
import { z } from 'zod';
import { GameflowCoordinator } from './match/gameflow-coordinator';
import { PersonalHistoryService } from './history/personal-history-service';
import { ReadyCheckAutoAcceptor } from './match/ready-check-auto-acceptor';
import { createSgpClient } from './sgp/sgp-client';
import { registerLcuAssetProtocol } from './lcu/asset-protocol';
import { readGameflowSessionIdentity } from './lcu/gameflow-session';
import type { LiveMatch, LiveRoster } from '../shared/ipc';
import { LcuStaticDataCache } from './lcu/static-data-cache';

protocol.registerSchemesAsPrivileged([{
  scheme: 'lol-asset',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
}]);

let database: Database.Database | undefined;
let coordinator: GameflowCoordinator | undefined;
let readyCheckAutoAcceptor: ReadyCheckAutoAcceptor | undefined;
let usageReporter: UsageReporter | undefined;

function rosterFromMatch(match: LiveMatch): LiveRoster {
  return {
    ...match,
    players: match.players.map(({ playerId, displayName, teamId, isLocalTeam, lane, championId }) => ({
      playerId,
      displayName,
      teamId,
      ...(isLocalTeam === undefined ? {} : { isLocalTeam }),
      lane,
      championId
    }))
  };
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: appIcon,
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
  const aramFixtureMode = fixtureMode && process.argv.includes('--fixture-aram');
  registerLcuAssetProtocol(join(app.getPath('userData'), 'asset-cache'), fixtureMode);
  database = new Database(join(app.getPath('userData'), 'lol-viewer.sqlite3'));
  migrateDatabase(database);
  const cache = new MatchCache(database);
  const guideCache = new ChampionGuideCache(database);
  const personalHistoryCache = new PersonalHistoryCache(database);
  const staticData = new LcuStaticDataCache();
  const patchSchema = z.string().regex(/^\d+\.\d+(?:\.\d+){0,2}$/);
  const guideClient = new ChampionGuideClient({
    baseUrl: process.env.CHAMPION_GUIDE_SERVICE_URL ?? 'http://127.0.0.1:8787',
    ...(process.env.CHAMPION_GUIDE_PATCH ? { patch: process.env.CHAMPION_GUIDE_PATCH } : {
      getPatch: async () => {
        const connection = await discoverLcuConnection();
        if (!connection) throw new Error('League client is unavailable');
        const version = patchSchema.parse(await staticData.getAssetVersion(createLcuClient(connection)));
        return version.split('.').slice(0, 2).join('.');
      }
    }), cache: guideCache, bundledGuide: getBundledGuide
  });
  let catalogService: ChampionCatalogService | undefined;
  const getCatalogService = async (): Promise<ChampionCatalogService> => {
    if (catalogService) return catalogService;
    const connection = await discoverLcuConnection();
    if (!connection) throw new Error('League client is unavailable');
    catalogService = new ChampionCatalogService(createLcuClient(connection), staticData);
    return catalogService;
  };
  registerChampionIpc({
    getChampionGuide: async (championId, lane) => {
      const guide = await guideClient.getChampionGuide(championId, lane);
      const itemIds = [...(guide.starterItemIds ?? []), ...(guide.bootsItemIds ?? []), ...guide.builds.flatMap((build) => build.itemIds)];
      try {
        const itemIconPaths = await (await getCatalogService()).getItemIconPaths(itemIds);
        return { ...guide, itemIconPaths };
      } catch {
        return guide;
      }
    },
    getCatalog: async () => (await getCatalogService()).getCatalog(),
    getDetails: async (championId) => (await getCatalogService()).getDetails(championId)
  });
  const settingsService = new SettingsService(database, cache, guideCache, personalHistoryCache);
  registerSettingsIpc({
    get: () => settingsService.get(),
    clearCache: () => settingsService.clearCache(),
    update: patch => {
      const settings = settingsService.update(patch);
      usageReporter?.setEnabled(settings.usageStatistics !== false);
      return settings;
    }
  });
  const getDeviceId = createDeviceIdProvider(join(app.getPath('appData'), 'lol-viewer-identity'));
  const feedback = new FeedbackService(async () => ({
    deviceId: fixtureMode ? 'f'.repeat(64) : await getDeviceId(),
    clientVersion: app.isPackaged ? app.getVersion() : (JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { version: string }).version,
    systemInfo: `${process.platform} ${release()} / ${process.arch}`
  }), feedbackEndpoint(app.isPackaged, process.env.LOL_VIEWER_FEEDBACK_URL));
  registerFeedbackIpc({
    getFeedbackContext: () => feedback.getContext(),
    submitFeedback: (input) => fixtureMode && !process.env.LOL_VIEWER_FEEDBACK_URL
      ? Promise.resolve({ ok: false as const, error: '预览模式不会向线上提交反馈。' }) : feedback.submit(input)
  });
  if (!fixtureMode) {
    readyCheckAutoAcceptor = new ReadyCheckAutoAcceptor({
      getSettings: () => settingsService.get(),
      discover: discoverLcuConnection,
      createClient: createLcuClient
    });
    readyCheckAutoAcceptor.start();
  }
  registerHistoryIpc({
    load: async (target) => {
      if (fixtureMode) return createFixturePersonalHistory(target);
      const connection = await discoverLcuConnection();
      if (!connection) throw new Error('League client is unavailable');
      const lcu = createLcuClient(connection);
      const sgp = connection.region?.toUpperCase() === 'TENCENT' && connection.rsoPlatformId
        ? createSgpClient(lcu, connection.rsoPlatformId)
        : undefined;
      return new PersonalHistoryService(lcu, personalHistoryCache, sgp, staticData).load(target);
    }
  });
  coordinator = new GameflowCoordinator(async (scope, onPlayer, signal) => {
      if (aramFixtureMode) return createFixtureAramLiveMatch(scope);
      if (fixtureMode) return createFixtureLiveMatch(scope);
      const connection = await discoverLcuConnection();
      if (signal.aborted) throw Object.assign(new Error('Live match request cancelled'), { code: 'MATCH_CANCELLED' as const });
      if (!connection) throw new Error('League client is unavailable');
      const lcu = createLcuClient(connection);
      const sgp = connection.region?.toUpperCase() === 'TENCENT' && connection.rsoPlatformId
        ? createSgpClient(lcu, connection.rsoPlatformId)
        : undefined;
      return new MatchService(lcu, { cache, staticData, ...(sgp ? { sgp } : {}) }).loadLiveMatch(scope, onPlayer, signal);
  });
  registerMatchIpc({
    loadLiveMatch: (scope, onPlayer) => coordinator!.loadLiveMatch(scope, onPlayer),
    getLiveRoster: async () => {
      if (aramFixtureMode) return rosterFromMatch(createFixtureAramLiveMatch('all'));
      if (fixtureMode) return rosterFromMatch(createFixtureLiveMatch('all'));
      const connection = await discoverLcuConnection();
      if (!connection) throw new Error('League client is unavailable');
      return new MatchService(createLcuClient(connection)).loadLiveRoster();
    },
    retry: () => coordinator?.retry(),
    cancel: () => coordinator?.cancel(),
    getGameflowPhase: async () => {
      if (fixtureMode || aramFixtureMode) return 'InProgress';
      const connection = await discoverLcuConnection();
      if (!connection) throw new Error('League client is unavailable');
      return createLcuClient(connection).get('/lol-gameflow/v1/gameflow-phase', z.string().min(1));
    },
    getGameflowSessionIdentity: async () => {
      if (fixtureMode || aramFixtureMode) return { phase: 'InProgress', gameId: 'fixture-game' };
      const connection = await discoverLcuConnection();
      if (!connection) return { phase: 'None', connected: false };
      return { ...await readGameflowSessionIdentity(createLcuClient(connection)), connected: true };
    }
  });
  createWindow();
  // Development and fixture sessions must never pollute production statistics.
  if (app.isPackaged && !fixtureMode) {
    usageReporter = new UsageReporter(async () => ({
      deviceId: await getDeviceId(), clientVersion: app.getVersion(),
      osName: process.platform, osVersion: release(), arch: process.arch
    }));
    usageReporter.setEnabled(settingsService.get().usageStatistics !== false);
    powerMonitor.on('resume', () => usageReporter?.resume());
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  usageReporter?.dispose();
  usageReporter = undefined;
  readyCheckAutoAcceptor?.dispose();
  readyCheckAutoAcceptor = undefined;
  coordinator?.dispose();
  coordinator = undefined;
  database?.close();
  database = undefined;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

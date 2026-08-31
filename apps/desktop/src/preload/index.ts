import { contextBridge, ipcRenderer } from 'electron';
import { z } from 'zod';
import type { PersonalHistorySnapshot, PlayerSnapshot, QueueScope } from '../shared/domain';
import {
  MATCH_GET_CHANNEL,
  MATCH_CANCEL_CHANNEL,
  MATCH_RETRY_CHANNEL,
  GAMEFLOW_PHASE_GET_CHANNEL,
  GAMEFLOW_SESSION_GET_CHANNEL,
  CHAMPION_GUIDE_GET_CHANNEL,
  CHAMPION_CATALOG_GET_CHANNEL,
  CHAMPION_DETAILS_GET_CHANNEL,
  PERSONAL_HISTORY_GET_CHANNEL,
  PLAYER_UPDATED_CHANNEL,
  SETTINGS_CLEAR_CACHE_CHANNEL,
  SETTINGS_GET_CHANNEL,
  SETTINGS_UPDATE_CHANNEL,
  appSettingsPatchSchema,
  appSettingsSchema,
  liveMatchSchema,
  liveMatchRequestSchema,
  gameflowPhaseSchema,
  gameflowSessionIdentitySchema,
  playerUpdateSchema,
  playerSnapshotSchema,
  queueScopeSchema,
  championGuideRequestSchema,
  championGuideSchema,
  championCatalogSchema,
  championDetailsRequestSchema,
  championDetailsSchema,
  personalHistorySchema,
  type AppSettings,
  type ChampionLane,
  type LiveMatch,
  type LolViewerApi
} from '../shared/ipc';

const api: LolViewerApi = Object.freeze({
  getPersonalHistory: async (): Promise<PersonalHistorySnapshot> =>
    personalHistorySchema.parse(await ipcRenderer.invoke(PERSONAL_HISTORY_GET_CHANNEL)),
  getLiveMatch: async (scope: QueueScope, generation = 0): Promise<LiveMatch> => {
    const input = liveMatchRequestSchema.parse({ scope: queueScopeSchema.parse(scope), generation });
    return liveMatchSchema.parse(await ipcRenderer.invoke(MATCH_GET_CHANNEL, input));
  },
  getGameflowPhase: async (): Promise<string> =>
    gameflowPhaseSchema.parse(await ipcRenderer.invoke(GAMEFLOW_PHASE_GET_CHANNEL)),
  getGameflowSessionIdentity: async () =>
    gameflowSessionIdentitySchema.parse(await ipcRenderer.invoke(GAMEFLOW_SESSION_GET_CHANNEL)),
  retryLiveMatch: async (): Promise<void> => z.undefined().parse(await ipcRenderer.invoke(MATCH_RETRY_CHANNEL)),
  cancelLiveMatch: async (): Promise<void> => z.undefined().parse(await ipcRenderer.invoke(MATCH_CANCEL_CHANNEL)),
  onPlayerUpdated: (listener: (player: PlayerSnapshot, generation?: number) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, input: unknown): void => {
      const update = playerUpdateSchema.safeParse(input);
      if (update.success) listener(update.data.player, update.data.generation);
    };
    ipcRenderer.on(PLAYER_UPDATED_CHANNEL, handler);
    return () => ipcRenderer.removeListener(PLAYER_UPDATED_CHANNEL, handler);
  },
  getSettings: async (): Promise<AppSettings> =>
    appSettingsSchema.parse(await ipcRenderer.invoke(SETTINGS_GET_CHANNEL)),
  updateSettings: async (patch: Partial<AppSettings>): Promise<AppSettings> => {
    const input = appSettingsPatchSchema.parse(patch);
    return appSettingsSchema.parse(await ipcRenderer.invoke(SETTINGS_UPDATE_CHANNEL, input));
  },
  clearCache: async (): Promise<void> => {
    const result: unknown = await ipcRenderer.invoke(SETTINGS_CLEAR_CACHE_CHANNEL);
    z.undefined().parse(result);
  },
  getChampionGuide: async (championId: number, lane: ChampionLane) => {
    const input = championGuideRequestSchema.parse({ championId, lane });
    return championGuideSchema.parse(await ipcRenderer.invoke(CHAMPION_GUIDE_GET_CHANNEL, input));
  },
  getChampionCatalog: async () =>
    championCatalogSchema.parse(await ipcRenderer.invoke(CHAMPION_CATALOG_GET_CHANNEL)),
  getChampionDetails: async (championId: number) => {
    const input = championDetailsRequestSchema.parse({ championId });
    return championDetailsSchema.parse(await ipcRenderer.invoke(CHAMPION_DETAILS_GET_CHANNEL, input));
  }
});

contextBridge.exposeInMainWorld('lolViewer', api);

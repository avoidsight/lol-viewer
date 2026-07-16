import { contextBridge, ipcRenderer } from 'electron';
import { z } from 'zod';
import type { PlayerSnapshot, QueueScope } from '../shared/domain';
import {
  MATCH_GET_CHANNEL,
  PLAYER_UPDATED_CHANNEL,
  SETTINGS_CLEAR_CACHE_CHANNEL,
  SETTINGS_GET_CHANNEL,
  SETTINGS_UPDATE_CHANNEL,
  appSettingsPatchSchema,
  appSettingsSchema,
  liveMatchSchema,
  playerSnapshotSchema,
  queueScopeSchema,
  type AppSettings,
  type LiveMatch,
  type LolViewerApi
} from '../shared/ipc';

const api: LolViewerApi = Object.freeze({
  getLiveMatch: async (scope: QueueScope): Promise<LiveMatch> => {
    const input = queueScopeSchema.parse(scope);
    return liveMatchSchema.parse(await ipcRenderer.invoke(MATCH_GET_CHANNEL, input));
  },
  onPlayerUpdated: (listener: (player: PlayerSnapshot) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, input: unknown): void => {
      const player = playerSnapshotSchema.safeParse(input);
      if (player.success) listener(player.data);
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
  }
});

contextBridge.exposeInMainWorld('lolViewer', api);

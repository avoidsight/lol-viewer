import { contextBridge, ipcRenderer } from 'electron';
import type { PlayerSnapshot, QueueScope } from '../shared/domain';
import {
  MATCH_GET_CHANNEL,
  PLAYER_UPDATED_CHANNEL,
  liveMatchSchema,
  playerSnapshotSchema,
  type LiveMatch,
  type LolViewerApi
} from '../shared/ipc';

const api: LolViewerApi = Object.freeze({
  getLiveMatch: async (scope: QueueScope): Promise<LiveMatch> =>
    liveMatchSchema.parse(await ipcRenderer.invoke(MATCH_GET_CHANNEL, scope)),
  onPlayerUpdated: (listener: (player: PlayerSnapshot) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, input: unknown): void => {
      const player = playerSnapshotSchema.safeParse(input);
      if (player.success) listener(player.data);
    };
    ipcRenderer.on(PLAYER_UPDATED_CHANNEL, handler);
    return () => ipcRenderer.removeListener(PLAYER_UPDATED_CHANNEL, handler);
  }
});

contextBridge.exposeInMainWorld('lolViewer', api);

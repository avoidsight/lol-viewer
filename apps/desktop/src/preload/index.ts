import { contextBridge, ipcRenderer } from 'electron';
import type { PlayerSnapshot, QueueScope } from '../shared/domain';
import {
  MATCH_GET_CHANNEL,
  PLAYER_UPDATED_CHANNEL,
  type LiveMatch,
  type LolViewerApi
} from '../shared/ipc';

const api: LolViewerApi = Object.freeze({
  getLiveMatch: (scope: QueueScope): Promise<LiveMatch> => ipcRenderer.invoke(MATCH_GET_CHANNEL, scope),
  onPlayerUpdated: (listener: (player: PlayerSnapshot) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, player: PlayerSnapshot): void => listener(player);
    ipcRenderer.on(PLAYER_UPDATED_CHANNEL, handler);
    return () => ipcRenderer.removeListener(PLAYER_UPDATED_CHANNEL, handler);
  }
});

contextBridge.exposeInMainWorld('lolViewer', api);

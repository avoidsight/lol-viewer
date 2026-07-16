import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import type { PlayerSnapshot, QueueScope } from '../../shared/domain';
import { MATCH_GET_CHANNEL, PLAYER_UPDATED_CHANNEL, type LiveMatch } from '../../shared/ipc';

const scopeSchema = z.enum(['ranked-solo', 'all']);

export interface LiveMatchLoader {
  loadLiveMatch(scope: QueueScope, onPlayer: (player: PlayerSnapshot) => void): Promise<LiveMatch>;
}

export function registerMatchIpc(service: LiveMatchLoader): void {
  ipcMain.handle(MATCH_GET_CHANNEL, (event: IpcMainInvokeEvent, input: unknown) => {
    const scope = scopeSchema.parse(input);
    return service.loadLiveMatch(scope, (player) => event.sender.send(PLAYER_UPDATED_CHANNEL, player));
  });
}

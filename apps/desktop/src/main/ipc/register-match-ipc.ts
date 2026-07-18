import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import type { PlayerSnapshot, QueueScope } from '../../shared/domain';
import { MATCH_CANCEL_CHANNEL, MATCH_GET_CHANNEL, MATCH_RETRY_CHANNEL, PLAYER_UPDATED_CHANNEL, liveMatchRequestSchema, liveMatchSchema, playerUpdateSchema, type LiveMatch } from '../../shared/ipc';
import { assertAuthorizedRenderer } from './authorization';

export interface LiveMatchLoader {
  loadLiveMatch(scope: QueueScope, onPlayer: (player: PlayerSnapshot) => void): Promise<LiveMatch>;
  retry?(): void;
  cancel?(): void;
}

export function registerMatchIpc(service: LiveMatchLoader): void {
  ipcMain.handle(MATCH_GET_CHANNEL, async (event: IpcMainInvokeEvent, input: unknown) => {
    assertAuthorizedRenderer(event);
    const request = liveMatchRequestSchema.parse(input);
    return liveMatchSchema.parse(await service.loadLiveMatch(request.scope, (player) => event.sender.send(PLAYER_UPDATED_CHANNEL, playerUpdateSchema.parse({ generation: request.generation, player }))));
  });
  ipcMain.handle(MATCH_RETRY_CHANNEL, (event: IpcMainInvokeEvent, input: unknown) => {
    assertAuthorizedRenderer(event);
    z.undefined().parse(input);
    service.retry?.();
  });
  ipcMain.handle(MATCH_CANCEL_CHANNEL, (event: IpcMainInvokeEvent, input: unknown) => {
    assertAuthorizedRenderer(event);
    z.undefined().parse(input);
    service.cancel?.();
  });
}

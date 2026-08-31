import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import type { PlayerSnapshot, QueueScope } from '../../shared/domain';
import { GAMEFLOW_PHASE_GET_CHANNEL, GAMEFLOW_SESSION_GET_CHANNEL, MATCH_CANCEL_CHANNEL, MATCH_GET_CHANNEL, MATCH_RETRY_CHANNEL, PLAYER_UPDATED_CHANNEL, gameflowPhaseSchema, gameflowSessionIdentitySchema, liveMatchRequestSchema, liveMatchSchema, playerUpdateSchema, type GameflowSessionIdentity, type LiveMatch } from '../../shared/ipc';
import { assertAuthorizedRenderer } from './authorization';

export interface LiveMatchLoader {
  loadLiveMatch(scope: QueueScope, onPlayer: (player: PlayerSnapshot) => void): Promise<LiveMatch>;
  retry?(): void;
  cancel?(): void;
  getGameflowPhase(): Promise<string>;
  getGameflowSessionIdentity(): Promise<GameflowSessionIdentity>;
}

export function registerMatchIpc(service: LiveMatchLoader): void {
  ipcMain.handle(GAMEFLOW_PHASE_GET_CHANNEL, async (event: IpcMainInvokeEvent) => {
    assertAuthorizedRenderer(event);
    return gameflowPhaseSchema.parse(await service.getGameflowPhase());
  });
  ipcMain.handle(GAMEFLOW_SESSION_GET_CHANNEL, async (event: IpcMainInvokeEvent) => {
    assertAuthorizedRenderer(event);
    return gameflowSessionIdentitySchema.parse(await service.getGameflowSessionIdentity());
  });
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

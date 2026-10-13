import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import type { PlayerSnapshot, QueueScope } from '../../shared/domain';
import { GAMEFLOW_PHASE_GET_CHANNEL, GAMEFLOW_SESSION_GET_CHANNEL, MATCH_CANCEL_CHANNEL, MATCH_GET_CHANNEL, MATCH_RETRY_CHANNEL, MATCH_ROSTER_GET_CHANNEL, PLAYER_UPDATED_CHANNEL, gameflowPhaseSchema, gameflowSessionIdentitySchema, liveMatchRequestSchema, liveMatchSchema, liveRosterSchema, playerUpdateSchema, type GameflowSessionIdentity, type LiveMatch, type LiveRoster } from '../../shared/ipc';
import { assertAuthorizedRenderer } from './authorization';
import { diagnosticPhase, safeLiveError, type DiagnosticOperation } from '../diagnostics/logger';
import { LIVE_DIAGNOSTIC, liveDiagnosticEventSchema, type Diagnostic } from '../../shared/diagnostics';

async function diagnosed<T>(operation: DiagnosticOperation, action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) {
    if ((error as { code?: string } | null)?.code === 'MATCH_CANCELLED') throw error;
    throw safeLiveError(error, operation);
  }
}

export interface LiveMatchLoader {
  loadLiveMatch(scope: QueueScope, onPlayer: (player: PlayerSnapshot) => void, onError?: (diagnostic: Diagnostic) => void): Promise<LiveMatch>;
  getLiveRoster(): Promise<LiveRoster>;
  retry?(): void;
  cancel?(): void;
  getGameflowPhase(): Promise<string>;
  getGameflowSessionIdentity(): Promise<GameflowSessionIdentity>;
}

export function registerMatchIpc(service: LiveMatchLoader): void {
  ipcMain.handle(GAMEFLOW_PHASE_GET_CHANNEL, async (event: IpcMainInvokeEvent) => {
    assertAuthorizedRenderer(event);
    return diagnosed('phase', async () => { const phase = gameflowPhaseSchema.parse(await service.getGameflowPhase()); diagnosticPhase(phase); return phase; });
  });
  ipcMain.handle(GAMEFLOW_SESSION_GET_CHANNEL, async (event: IpcMainInvokeEvent) => {
    assertAuthorizedRenderer(event);
    return diagnosed('phase', async () => { const identity = gameflowSessionIdentitySchema.parse(await service.getGameflowSessionIdentity()); diagnosticPhase(identity.phase); return identity; });
  });
  ipcMain.handle(MATCH_GET_CHANNEL, async (event: IpcMainInvokeEvent, input: unknown) => {
    assertAuthorizedRenderer(event);
    const request = liveMatchRequestSchema.parse(input);
    return diagnosed('live.load', async () => liveMatchSchema.parse(await service.loadLiveMatch(request.scope,
      player => event.sender.send(PLAYER_UPDATED_CHANNEL, playerUpdateSchema.parse({ generation: request.generation, player })),
      diagnostic => event.sender.send(LIVE_DIAGNOSTIC, liveDiagnosticEventSchema.parse({ generation: request.generation, diagnostic }))
    )));
  });
  ipcMain.handle(MATCH_ROSTER_GET_CHANNEL, async (event: IpcMainInvokeEvent, input: unknown) => {
    assertAuthorizedRenderer(event);
    z.undefined().parse(input);
    return diagnosed('live.roster', async () => liveRosterSchema.parse(await service.getLiveRoster()));
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

import { z } from 'zod';
import { clipboard, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { PersonalHistorySnapshot } from '../../shared/domain';
import { PERSONAL_HISTORY_GET_CHANNEL, PERSONAL_MATCH_DETAIL_CHANNEL, PERSONAL_MATCH_DETAIL_CANCEL_CHANNEL, personalMatchDetailRequestSchema, personalMatchDetailSchema, personalHistorySchema, personalHistoryTargetSchema, type PersonalHistoryTarget, type PersonalMatchDetail } from '../../shared/ipc';
import { historyErrorDiagnostic, safeHistoryError } from '../../shared/history-error';
import { recordDiagnostic } from '../diagnostics/logger';
import { assertAuthorizedRenderer } from './authorization';
import { PLAYER_SEARCH, PLAYER_SEARCH_CLIPBOARD, clipboardPlayerId, playerSearchInputSchema, playerSearchResultSchema, type PlayerSearchResult } from '../../shared/player-search';

export interface PersonalHistoryLoader {
  load(target?: PersonalHistoryTarget, forceRefresh?: boolean): Promise<PersonalHistorySnapshot>;
  search?(input: string): Promise<PlayerSearchResult>;
  loadDetail?(matchId: string, target: PersonalHistoryTarget, signal: AbortSignal): Promise<PersonalMatchDetail>;
}

export function registerHistoryIpc(service: PersonalHistoryLoader): void {
  const detailRequests = new Map<number, { requestId: number; controller: AbortController }>();
  ipcMain.handle(PERSONAL_MATCH_DETAIL_CHANNEL, async (event: IpcMainInvokeEvent, input: unknown) => {
    assertAuthorizedRenderer(event);
    const request = personalMatchDetailRequestSchema.parse(input);
    detailRequests.get(event.sender.id)?.controller.abort();
    const job = { requestId: request.requestId, controller: new AbortController() };
    detailRequests.set(event.sender.id, job);
    try {
      if (!service.loadDetail) throw new Error('Personal history is unavailable [HISTORY:NOT_READY]');
      const result = await service.loadDetail(request.matchId, request.target, job.controller.signal);
      return job.controller.signal.aborted ? null : personalMatchDetailSchema.parse(result);
    } catch (error) {
      if (job.controller.signal.aborted || (error as { code?: string } | null)?.code === 'MATCH_CANCELLED') return null;
      recordDiagnostic('history.detail', error); throw safeHistoryError(error);
    } finally { if (detailRequests.get(event.sender.id) === job) detailRequests.delete(event.sender.id); }
  });
  ipcMain.handle(PERSONAL_MATCH_DETAIL_CANCEL_CHANNEL, (event: IpcMainInvokeEvent, input: unknown) => {
    assertAuthorizedRenderer(event);
    const id = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(input);
    const job = detailRequests.get(event.sender.id);
    if (job?.requestId === id) job.controller.abort();
  });
  ipcMain.handle(PLAYER_SEARCH_CLIPBOARD, (event: IpcMainInvokeEvent) => {
    assertAuthorizedRenderer(event);
    try { return clipboardPlayerId(clipboard.readText()); } catch { return undefined; }
  });
  let searching = false;
  ipcMain.handle(PLAYER_SEARCH, async (event: IpcMainInvokeEvent, input: unknown) => {
    assertAuthorizedRenderer(event);
    const query = playerSearchInputSchema.parse(input);
    if (searching) return { ok: false, error: 'busy' };
    searching = true;
    try { return playerSearchResultSchema.parse(await service.search?.(query) ?? { ok: false, error: 'unavailable' }); }
    catch { return { ok: false, error: 'failed' }; }
    finally { searching = false; }
  });
  ipcMain.handle(PERSONAL_HISTORY_GET_CHANNEL, async (event: IpcMainInvokeEvent, input: unknown, refresh: unknown) => {
    assertAuthorizedRenderer(event);
    const forceRefresh = z.boolean().optional().parse(refresh);
    const target = personalHistoryTargetSchema.optional().parse(input);
    try { return personalHistorySchema.parse(await (forceRefresh ? service.load(target, true) : service.load(target))); }
    catch (error) {
      recordDiagnostic('history.load', error);
      // 只记录脱敏的原因码、来源与状态码，便于定位刷新失败；不记录响应体、路径或令牌。
      console.warn(`[history] 战绩读取失败：${historyErrorDiagnostic(error)}`);
      throw safeHistoryError(error);
    }
  });
}

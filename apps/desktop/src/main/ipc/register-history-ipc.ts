import { z } from 'zod';
import { clipboard, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { PersonalHistorySnapshot } from '../../shared/domain';
import { PERSONAL_HISTORY_GET_CHANNEL, personalHistorySchema, personalHistoryTargetSchema, type PersonalHistoryTarget } from '../../shared/ipc';
import { historyErrorDiagnostic, safeHistoryError } from '../../shared/history-error';
import { assertAuthorizedRenderer } from './authorization';
import { PLAYER_SEARCH, PLAYER_SEARCH_CLIPBOARD, clipboardPlayerId, playerSearchInputSchema, playerSearchResultSchema, type PlayerSearchResult } from '../../shared/player-search';

export interface PersonalHistoryLoader {
  load(target?: PersonalHistoryTarget, forceRefresh?: boolean): Promise<PersonalHistorySnapshot>;
  search?(input: string): Promise<PlayerSearchResult>;
}

export function registerHistoryIpc(service: PersonalHistoryLoader): void {
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
      // 只记录脱敏的原因码、来源与状态码，便于定位刷新失败；不记录响应体、路径或令牌。
      console.warn(`[history] 战绩读取失败：${historyErrorDiagnostic(error)}`);
      throw safeHistoryError(error);
    }
  });
}

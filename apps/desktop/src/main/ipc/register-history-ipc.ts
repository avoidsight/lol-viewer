import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { PersonalHistorySnapshot } from '../../shared/domain';
import { PERSONAL_HISTORY_GET_CHANNEL, personalHistorySchema, personalHistoryTargetSchema, type PersonalHistoryTarget } from '../../shared/ipc';
import { assertAuthorizedRenderer } from './authorization';
import { PLAYER_SEARCH, playerSearchInputSchema, playerSearchResultSchema, type PlayerSearchResult } from '../../shared/player-search';

export interface PersonalHistoryLoader {
  load(target?: PersonalHistoryTarget): Promise<PersonalHistorySnapshot>;
  search?(input: string): Promise<PlayerSearchResult>;
}

export function registerHistoryIpc(service: PersonalHistoryLoader): void {
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
  ipcMain.handle(PERSONAL_HISTORY_GET_CHANNEL, async (event: IpcMainInvokeEvent, input: unknown) => {
    assertAuthorizedRenderer(event);
    const target = personalHistoryTargetSchema.optional().parse(input);
    return personalHistorySchema.parse(await service.load(target));
  });
}

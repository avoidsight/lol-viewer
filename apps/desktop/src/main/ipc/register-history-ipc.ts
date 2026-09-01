import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { PersonalHistorySnapshot } from '../../shared/domain';
import { PERSONAL_HISTORY_GET_CHANNEL, personalHistorySchema, personalHistoryTargetSchema, type PersonalHistoryTarget } from '../../shared/ipc';
import { assertAuthorizedRenderer } from './authorization';

export interface PersonalHistoryLoader {
  load(target?: PersonalHistoryTarget): Promise<PersonalHistorySnapshot>;
}

export function registerHistoryIpc(service: PersonalHistoryLoader): void {
  ipcMain.handle(PERSONAL_HISTORY_GET_CHANNEL, async (event: IpcMainInvokeEvent, input: unknown) => {
    assertAuthorizedRenderer(event);
    const target = personalHistoryTargetSchema.optional().parse(input);
    return personalHistorySchema.parse(await service.load(target));
  });
}

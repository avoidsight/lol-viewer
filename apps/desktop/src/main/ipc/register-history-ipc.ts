import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import type { PersonalHistorySnapshot } from '../../shared/domain';
import { PERSONAL_HISTORY_GET_CHANNEL, personalHistorySchema } from '../../shared/ipc';
import { assertAuthorizedRenderer } from './authorization';

export interface PersonalHistoryLoader {
  load(): Promise<PersonalHistorySnapshot>;
}

export function registerHistoryIpc(service: PersonalHistoryLoader): void {
  ipcMain.handle(PERSONAL_HISTORY_GET_CHANNEL, async (event: IpcMainInvokeEvent, input: unknown) => {
    assertAuthorizedRenderer(event);
    z.undefined().parse(input);
    return personalHistorySchema.parse(await service.load());
  });
}

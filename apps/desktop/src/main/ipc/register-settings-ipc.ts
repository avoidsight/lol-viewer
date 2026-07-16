import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import type { AppSettings } from '../../shared/ipc';
import {
  SETTINGS_CLEAR_CACHE_CHANNEL,
  SETTINGS_GET_CHANNEL,
  SETTINGS_UPDATE_CHANNEL,
  appSettingsPatchSchema,
  appSettingsSchema
} from '../../shared/ipc';
import { assertAuthorizedRenderer } from './authorization';

export interface SettingsIpcService {
  get(): AppSettings;
  update(patch: Partial<AppSettings>): AppSettings;
  clearCache(): void;
}

export function registerSettingsIpc(service: SettingsIpcService): void {
  ipcMain.handle(SETTINGS_GET_CHANNEL, async (event: IpcMainInvokeEvent) => {
    assertAuthorizedRenderer(event);
    return appSettingsSchema.parse(service.get());
  });
  ipcMain.handle(SETTINGS_UPDATE_CHANNEL, async (event: IpcMainInvokeEvent, input: unknown) => {
    assertAuthorizedRenderer(event);
    const patch = appSettingsPatchSchema.parse(input);
    return appSettingsSchema.parse(service.update(patch));
  });
  ipcMain.handle(SETTINGS_CLEAR_CACHE_CHANNEL, async (event: IpcMainInvokeEvent) => {
    assertAuthorizedRenderer(event);
    z.undefined().parse(service.clearCache());
  });
}

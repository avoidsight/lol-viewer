import { describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({ handle: vi.fn(), getAllWindows: vi.fn() }));
vi.mock('electron', () => ({
  app: { getVersion: () => '1.2.3' },
  ipcMain: { handle: electron.handle },
  BrowserWindow: { getAllWindows: electron.getAllWindows }
}));

import {
  SETTINGS_CLEAR_CACHE_CHANNEL,
  APP_VERSION_CHANNEL,
  SETTINGS_GET_CHANNEL,
  SETTINGS_UPDATE_CHANNEL
} from '../../shared/ipc';
import { registerSettingsIpc } from './register-settings-ipc';

describe('registerSettingsIpc', () => {
  it('authorizes the active window and validates input and service output', async () => {
    const sender = {};
    electron.getAllWindows.mockReturnValue([{ webContents: sender, isDestroyed: () => false }]);
    const service = {
      get: vi.fn(() => ({ autoOpenLiveMatch: true, showLaneDifferences: true, autoAcceptReadyCheck: false })),
      update: vi.fn((patch) => ({ autoOpenLiveMatch: true, showLaneDifferences: true, autoAcceptReadyCheck: false, ...patch })),
      clearCache: vi.fn()
    };
    registerSettingsIpc(service);
    const version = electron.handle.mock.calls.find(([channel]) => channel === APP_VERSION_CHANNEL)?.[1];
    expect(version({ sender })).toBe('1.2.3');
    expect(() => version({ sender: {} })).toThrow('Unauthorized');
    const get = electron.handle.mock.calls.find(([channel]) => channel === SETTINGS_GET_CHANNEL)?.[1];
    const update = electron.handle.mock.calls.find(([channel]) => channel === SETTINGS_UPDATE_CHANNEL)?.[1];
    const clear = electron.handle.mock.calls.find(([channel]) => channel === SETTINGS_CLEAR_CACHE_CHANNEL)?.[1];

    await expect(get({ sender: {} })).rejects.toThrow('Unauthorized');
    await expect(update({ sender }, { queueScope: 'invalid' })).rejects.toThrow();
    await expect(update({ sender }, { autoOpenLiveMatch: false })).resolves.toMatchObject({ autoOpenLiveMatch: false });
    await expect(clear({ sender })).resolves.toBeUndefined();
    expect(service.clearCache).toHaveBeenCalledOnce();

    service.clearCache.mockReturnValueOnce('unexpected' as never);
    await expect(clear({ sender })).rejects.toThrow();

    service.get.mockReturnValueOnce({ autoOpenLiveMatch: 'invalid' } as never);
    await expect(get({ sender })).rejects.toThrow();

    service.update.mockReturnValueOnce({ autoOpenLiveMatch: 'invalid' } as never);
    await expect(update({ sender }, {})).rejects.toThrow();
  });
});

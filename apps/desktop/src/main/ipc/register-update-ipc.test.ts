import { expect, it, vi } from 'vitest';
const { handle, getAllWindows } = vi.hoisted(() => ({ handle: vi.fn(), getAllWindows: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle }, BrowserWindow: { getAllWindows } }));
import { registerUpdateIpc } from './register-update-ipc';
import type { UpdateService } from '../updates/service';
import { idleUpdateDownload, UPDATE_CANCEL, UPDATE_CHECK, UPDATE_DOWNLOAD, UPDATE_INSTALL, UPDATE_STATE, UPDATE_STATUS, type UpdateDownloadState } from '../../shared/updates';
it('authorizes operations, accepts only versions and broadcasts safe progress', () => {
  handle.mockClear();
  const sender = { send: vi.fn(), isDestroyed: () => false };
  getAllWindows.mockReturnValue([{ webContents: sender, isDestroyed: () => false }]);
  const service = { check: vi.fn(), status: vi.fn(), download: vi.fn(), cancel: vi.fn(), install: vi.fn(), subscribe: vi.fn((_listener: (s: UpdateDownloadState) => void) => {}) };
  registerUpdateIpc(service as unknown as UpdateService);
  for (const channel of [UPDATE_CHECK, UPDATE_STATUS, UPDATE_DOWNLOAD, UPDATE_CANCEL, UPDATE_INSTALL]) {
    const handler = handle.mock.calls.find(([name]) => name === channel)![1];
    expect(() => handler({ sender: {} }, '1.1.0')).toThrow('Unauthorized');
    if ([UPDATE_DOWNLOAD, UPDATE_INSTALL].includes(channel)) {
      expect(() => handler({ sender }, 'C:\\evil.exe')).toThrow();
      expect(() => handler({ sender }, { version: '1.1.0', path: '/evil' })).toThrow();
    }
    handler({ sender }, '1.1.0');
  }
  expect(service.download).toHaveBeenCalledExactlyOnceWith('1.1.0');
  expect(service.install).toHaveBeenCalledExactlyOnceWith('1.1.0');
  service.subscribe.mock.calls[0][0](idleUpdateDownload);
  expect(sender.send).toHaveBeenCalledWith(UPDATE_STATE, idleUpdateDownload);
});

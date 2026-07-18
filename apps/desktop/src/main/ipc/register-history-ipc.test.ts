import { describe, expect, it, vi } from 'vitest';

const { handle, getAllWindows } = vi.hoisted(() => ({ handle: vi.fn(), getAllWindows: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle }, BrowserWindow: { getAllWindows } }));

import { PERSONAL_HISTORY_GET_CHANNEL } from '../../shared/ipc';
import { createFixturePersonalHistory } from '../fixtures/live-match';
import { registerHistoryIpc } from './register-history-ipc';

describe('registerHistoryIpc', () => {
  it('authorizes the sender, requires undefined input, and validates the response', async () => {
    const snapshot = createFixturePersonalHistory();
    const load = vi.fn().mockResolvedValue(snapshot);
    const sender = {};
    getAllWindows.mockReturnValue([{ webContents: sender, isDestroyed: () => false }]);
    registerHistoryIpc({ load });
    const handler = handle.mock.calls.find(([channel]) => channel === PERSONAL_HISTORY_GET_CHANNEL)?.[1];

    await expect(handler({ sender }, undefined)).resolves.toEqual(snapshot);
    await expect(handler({ sender }, { unexpected: true })).rejects.toThrow();
    await expect(handler({ sender: {} }, undefined)).rejects.toThrow('Unauthorized IPC sender');

    load.mockResolvedValue({ ...snapshot, unexpected: true });
    await expect(handler({ sender }, undefined)).rejects.toThrow();
  });
});

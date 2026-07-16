import { describe, expect, it, vi } from 'vitest';

const { handle, getAllWindows } = vi.hoisted(() => ({ handle: vi.fn(), getAllWindows: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle }, BrowserWindow: { getAllWindows } }));

import { MATCH_GET_CHANNEL, PLAYER_UPDATED_CHANNEL } from '../../shared/ipc';
import { registerMatchIpc } from './register-match-ipc';

describe('registerMatchIpc', () => {
  it('validates scope before calling the service and streams updates to the sender', async () => {
    const loadLiveMatch = vi.fn(async (_scope, onPlayer) => {
      onPlayer({ playerId: '1' });
      return { players: [] };
    });
    const send = vi.fn();
    const sender = { send };
    getAllWindows.mockReturnValue([{ webContents: sender, isDestroyed: () => false }]);
    registerMatchIpc({ loadLiveMatch });
    const handler = handle.mock.calls.find(([channel]) => channel === MATCH_GET_CHANNEL)?.[1];

    expect(() => handler({ sender }, 'invalid')).toThrow();
    await expect(handler({ sender }, 'all')).resolves.toEqual({ players: [] });
    expect(loadLiveMatch).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(PLAYER_UPDATED_CHANNEL, { playerId: '1' });
  });
});

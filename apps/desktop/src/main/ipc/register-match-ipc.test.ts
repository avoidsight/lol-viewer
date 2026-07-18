import { describe, expect, it, vi } from 'vitest';

const { handle, getAllWindows } = vi.hoisted(() => ({ handle: vi.fn(), getAllWindows: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle }, BrowserWindow: { getAllWindows } }));

import { MATCH_GET_CHANNEL, PLAYER_UPDATED_CHANNEL } from '../../shared/ipc';
import { registerMatchIpc } from './register-match-ipc';
import { createFixtureLiveMatch } from '../fixtures/live-match';

describe('registerMatchIpc', () => {
  it('validates scope before calling the service and streams updates to the sender', async () => {
    const loadLiveMatch = vi.fn(async (_scope, onPlayer) => {
      onPlayer(createFixtureLiveMatch('all').players[0]);
      return createFixtureLiveMatch('all');
    });
    const send = vi.fn();
    const sender = { send };
    getAllWindows.mockReturnValue([{ webContents: sender, isDestroyed: () => false }]);
    registerMatchIpc({ loadLiveMatch });
    const handler = handle.mock.calls.find(([channel]) => channel === MATCH_GET_CHANNEL)?.[1];

    await expect(handler({ sender }, { scope: 'invalid', generation: 1 })).rejects.toThrow();
    await expect(handler({ sender }, { scope: 'all', generation: 7 })).resolves.toEqual(createFixtureLiveMatch('all'));
    expect(loadLiveMatch).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(PLAYER_UPDATED_CHANNEL, { generation: 7, player: createFixtureLiveMatch('all').players[0] });
  });
});

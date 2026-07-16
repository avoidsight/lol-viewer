import { describe, expect, it, vi } from 'vitest';

const { handle } = vi.hoisted(() => ({ handle: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle } }));

import { MATCH_GET_CHANNEL, PLAYER_UPDATED_CHANNEL } from '../../shared/ipc';
import { registerMatchIpc } from './register-match-ipc';

describe('registerMatchIpc', () => {
  it('validates scope before calling the service and streams updates to the sender', async () => {
    const loadLiveMatch = vi.fn(async (_scope, onPlayer) => {
      onPlayer({ playerId: '1' });
      return { players: [] };
    });
    const send = vi.fn();
    registerMatchIpc({ loadLiveMatch });
    const handler = handle.mock.calls.find(([channel]) => channel === MATCH_GET_CHANNEL)?.[1];

    expect(() => handler({ sender: { send } }, 'invalid')).toThrow();
    await expect(handler({ sender: { send } }, 'all')).resolves.toEqual({ players: [] });
    expect(loadLiveMatch).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(PLAYER_UPDATED_CHANNEL, { playerId: '1' });
  });
});

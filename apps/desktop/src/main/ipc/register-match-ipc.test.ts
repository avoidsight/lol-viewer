import { describe, expect, it, vi } from 'vitest';

const { handle, getAllWindows } = vi.hoisted(() => ({ handle: vi.fn(), getAllWindows: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle }, BrowserWindow: { getAllWindows } }));

import { GAMEFLOW_PHASE_GET_CHANNEL, GAMEFLOW_SESSION_GET_CHANNEL, MATCH_GET_CHANNEL, MATCH_ROSTER_GET_CHANNEL, PLAYER_UPDATED_CHANNEL } from '../../shared/ipc';
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
    const getGameflowPhase = vi.fn().mockResolvedValue('InProgress');
    const getGameflowSessionIdentity = vi.fn().mockResolvedValue({ phase: 'InProgress', gameId: '12345' });
    const fixture = createFixtureLiveMatch('all');
    const getLiveRoster = vi.fn().mockResolvedValue({
      ...fixture,
      players: fixture.players.map(({ playerId, displayName, teamId, isLocalTeam, lane, championId }) => ({ playerId, displayName, teamId, isLocalTeam, lane, championId }))
    });
    registerMatchIpc({ loadLiveMatch, getLiveRoster, getGameflowPhase, getGameflowSessionIdentity });
    const handler = handle.mock.calls.find(([channel]) => channel === MATCH_GET_CHANNEL)?.[1];
    const phaseHandler = handle.mock.calls.find(([channel]) => channel === GAMEFLOW_PHASE_GET_CHANNEL)?.[1];
    const identityHandler = handle.mock.calls.find(([channel]) => channel === GAMEFLOW_SESSION_GET_CHANNEL)?.[1];
    const rosterHandler = handle.mock.calls.find(([channel]) => channel === MATCH_ROSTER_GET_CHANNEL)?.[1];
    await expect(phaseHandler({ sender })).resolves.toBe('InProgress');
    await expect(identityHandler({ sender })).resolves.toEqual({ phase: 'InProgress', gameId: '12345' });
    expect(getGameflowPhase).toHaveBeenCalledOnce();
    await expect(rosterHandler({ sender })).resolves.toEqual(await getLiveRoster());

    await expect(handler({ sender }, { scope: 'invalid', generation: 1 })).rejects.toThrow();
    await expect(handler({ sender }, { scope: 'all', generation: 7 })).resolves.toEqual(createFixtureLiveMatch('all'));
    expect(loadLiveMatch).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(PLAYER_UPDATED_CHANNEL, { generation: 7, player: createFixtureLiveMatch('all').players[0] });
  });
});

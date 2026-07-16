import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}));

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.exposeInMainWorld },
  ipcRenderer: { invoke: electron.invoke, on: electron.on, removeListener: electron.removeListener }
}));

import type { LolViewerApi } from '../shared/ipc';

const validPlayer = {
  playerId: '1', displayName: 'Player 1', teamId: 100, lane: 'TOP', championId: 1,
  scope: 'all', matches: [], sampleSize: 0, wins: 0, losses: 0, winRate: 0,
  currentChampionGames: 0, currentChampionWins: 0, currentChampionWinRate: 0,
  status: 'ready', updatedAt: 1
};

async function loadApi(): Promise<LolViewerApi> {
  vi.resetModules();
  await import('./index');
  return electron.exposeInMainWorld.mock.calls.at(-1)?.[1] as LolViewerApi;
}

describe('preload match API validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects an invalid invoke result before returning it to the consumer', async () => {
    electron.invoke.mockResolvedValue({ players: [{ playerId: 'missing-fields' }] });
    const api = await loadApi();

    await expect(api.getLiveMatch('all')).rejects.toThrow();
  });

  it('does not deliver an invalid player update to the listener', async () => {
    const api = await loadApi();
    const listener = vi.fn();
    api.onPlayerUpdated(listener);
    const handler = electron.on.mock.calls.at(-1)?.[1];

    handler({}, { playerId: 'missing-fields' });
    expect(listener).not.toHaveBeenCalled();

    handler({}, validPlayer);
    expect(listener).toHaveBeenCalledOnce();
  });
});

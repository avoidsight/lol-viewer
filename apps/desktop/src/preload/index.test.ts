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
import { PERSONAL_HISTORY_GET_CHANNEL } from '../shared/ipc';
import { createFixturePersonalHistory } from '../main/fixtures/live-match';

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

  it('validates the lightweight gameflow phase response', async () => {
    const api = await loadApi();
    electron.invoke.mockResolvedValue('ChampSelect');
    await expect(api.getGameflowPhase()).resolves.toBe('ChampSelect');
    electron.invoke.mockResolvedValue('');
    await expect(api.getGameflowPhase()).rejects.toThrow();
  });
  it('validates the gameflow session identity response', async () => {
    const api = await loadApi();
    electron.invoke.mockResolvedValue({ phase: 'InProgress', gameId: '12345' });
    await expect(api.getGameflowSessionIdentity()).resolves.toEqual({ phase: 'InProgress', gameId: '12345' });
    electron.invoke.mockResolvedValue({ phase: 'InProgress', gameId: '' });
    await expect(api.getGameflowSessionIdentity()).rejects.toThrow();
  });  it('does not deliver an invalid player update to the listener', async () => {
    const api = await loadApi();
    const listener = vi.fn();
    api.onPlayerUpdated(listener);
    const handler = electron.on.mock.calls.at(-1)?.[1];

    handler({}, { playerId: 'missing-fields' });
    expect(listener).not.toHaveBeenCalled();

    handler({}, { generation: 1, player: validPlayer });
    expect(listener).toHaveBeenCalledOnce();
  });

  it('rejects unknown fields at match IPC boundaries', async () => {
    const api = await loadApi();
    const listener = vi.fn();
    api.onPlayerUpdated(listener);
    const handler = electron.on.mock.calls.at(-1)?.[1];

    handler({}, { generation: 1, player: { ...validPlayer, unexpected: true } });
    expect(listener).not.toHaveBeenCalled();

    electron.invoke.mockResolvedValue({
      players: Array.from({ length: 10 }, (_, index) => ({ ...validPlayer, playerId: String(index) })),
      unexpected: true
    });
    await expect(api.getLiveMatch('all')).rejects.toThrow();
  });

  it('validates settings updates before invoking and validates the response', async () => {
    const api = await loadApi();

    await expect(api.updateSettings({ queueScope: 'invalid' } as never)).rejects.toThrow();
    expect(electron.invoke).not.toHaveBeenCalled();

    electron.invoke.mockResolvedValue({ queueScope: 'ranked-solo' });
    await expect(api.getSettings()).rejects.toThrow();
  });

  it('requires cache clearing to return no value', async () => {
    electron.invoke.mockResolvedValue('unexpected');
    const api = await loadApi();

    await expect(api.clearCache()).rejects.toThrow();
  });

  it('validates champion guide inputs and strict responses', async () => {
    const api = await loadApi();
    await expect(api.getChampionGuide(0, 'TOP')).rejects.toThrow();
    expect(electron.invoke).not.toHaveBeenCalled();
    electron.invoke.mockResolvedValue({ championId: 114, lane: 'TOP' });
    await expect(api.getChampionGuide(114, 'TOP')).rejects.toThrow();
  });

  it('validates champion catalog and detail responses', async () => {
    const api = await loadApi();
    electron.invoke.mockResolvedValue([{ id: 145, name: '虚空之女', title: '卡莎', alias: 'Kaisa', roles: ['marksman'] }]);
    await expect(api.getChampionCatalog()).resolves.toHaveLength(1);
    electron.invoke.mockResolvedValue({ id: 145, name: '虚空之女' });
    await expect(api.getChampionDetails(145)).rejects.toThrow();
    await expect(api.getChampionDetails(0)).rejects.toThrow();
  });
  it('invokes personal history without input and validates its response strictly', async () => {
    const snapshot = createFixturePersonalHistory();
    electron.invoke.mockResolvedValue(snapshot);
    const api = await loadApi();

    await expect(api.getPersonalHistory()).resolves.toEqual(snapshot);
    expect(electron.invoke).toHaveBeenCalledWith(PERSONAL_HISTORY_GET_CHANNEL);

    electron.invoke.mockResolvedValue({ ...snapshot, unexpected: true });
    await expect(api.getPersonalHistory()).rejects.toThrow();
  });
});

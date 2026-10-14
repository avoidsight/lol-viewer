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

  it('validates selected detail requests and scoped cancellation', async () => {
    const api = await loadApi();
    const snapshot = createFixturePersonalHistory();
    const detail = { match: snapshot.matches[0], itemIconPaths: snapshot.itemIconPaths ?? {} };
    electron.invoke.mockResolvedValue(detail);
    await expect(api.getPersonalMatchDetail!(detail.match.matchId, { playerId: snapshot.playerId }, 1)).resolves.toEqual(detail);
    expect(electron.invoke).toHaveBeenLastCalledWith('history:get-detail', { matchId: detail.match.matchId, target: { playerId: snapshot.playerId }, requestId: 1 });
    await expect(api.getPersonalMatchDetail!('../bad', { playerId: snapshot.playerId }, 1)).rejects.toThrow();
    await api.cancelPersonalMatchDetail!(1); expect(electron.invoke).toHaveBeenLastCalledWith('history:cancel-detail', 1);
    await expect(api.cancelPersonalMatchDetail!(1.5)).rejects.toThrow();
    electron.invoke.mockResolvedValue(null);
    await expect(api.getPersonalMatchDetail!(detail.match.matchId, { playerId: snapshot.playerId }, 2)).resolves.toBeNull();
  });

  it('exports diagnostics through a fixed channel and only forwards validated error IDs', async () => {
    const api = await loadApi();
    electron.invoke.mockResolvedValue({ status: 'saved' });
    await expect(api.exportDiagnostics!()).resolves.toEqual({ status: 'saved' });
    expect(electron.invoke).toHaveBeenLastCalledWith('diagnostics:export');
    electron.invoke.mockResolvedValue({ status: 'saved', path: '/private' });
    await expect(api.exportDiagnostics!()).rejects.toThrow();
    const listener = vi.fn(); const off = api.onLiveDiagnostic!(listener);
    const handler = electron.on.mock.calls.at(-1)![1];
    const diagnostic = { id: 'D-012345ABCDEF', reason: 'SCHEMA' };
    handler({}, { generation: 7, diagnostic: { ...diagnostic, body: 'private' } });
    expect(listener).not.toHaveBeenCalled();
    handler({}, { generation: 7, diagnostic }); expect(listener).toHaveBeenCalledExactlyOnceWith(diagnostic, 7);
    off(); expect(electron.removeListener).toHaveBeenCalledWith('diagnostics:live-error', handler);
  });

  it('validates update commands and progress, removes listeners, exposes no browser fallback', async () => {
    const api = await loadApi();
    await expect(api.downloadUpdate!('https://evil.test/a.exe')).rejects.toThrow();
    expect(electron.invoke).not.toHaveBeenCalled();
    const state = { phase: 'ready', version: '1.1.0', receivedBytes: 10, totalBytes: 10 };
    electron.invoke.mockResolvedValue(state);
    expect(await api.downloadUpdate!('1.1.0')).toEqual(state);
    expect(electron.invoke).toHaveBeenLastCalledWith('updates:download', '1.1.0');
    await api.installUpdate!('1.1.0'); expect(electron.invoke).toHaveBeenLastCalledWith('updates:install', '1.1.0');
    const listener = vi.fn(); const off = api.onUpdateDownloadState!(listener);
    const handler = electron.on.mock.calls.at(-1)![1];
    handler({}, { ...state, path: '/evil' }); expect(listener).not.toHaveBeenCalled();
    handler({}, state); expect(listener).toHaveBeenCalledWith(state);
    off(); expect(electron.removeListener).toHaveBeenCalledWith('updates:state', handler);
    expect(api).not.toHaveProperty('openUpdate');
  });

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
  });

  it('validates lightweight roster refresh responses', async () => {
    const api = await loadApi();
    electron.invoke.mockResolvedValue({ players: [{ playerId: 'missing-fields' }] });
    await expect(api.getLiveRoster()).rejects.toThrow();
  });

  it('does not deliver an invalid player update to the listener', async () => {
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

    const target = { playerId: 'target', puuid: 'target-puuid', displayName: '目标玩家' };
    await expect(api.getPersonalHistory(target)).resolves.toEqual(snapshot);
    expect(electron.invoke).toHaveBeenLastCalledWith(PERSONAL_HISTORY_GET_CHANNEL, target);
    await expect(api.getPersonalHistory({ playerId: '' })).rejects.toThrow();

    electron.invoke.mockResolvedValue({ ...snapshot, unexpected: true });
    await expect(api.getPersonalHistory()).rejects.toThrow();
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonalHistorySnapshot, PlayerSnapshot } from '../../shared/domain';
import type { LiveMatch, LolViewerApi } from '../../shared/ipc';
import App from './App';

const history: PersonalHistorySnapshot = { playerId: 'me', displayName: '召唤师', profileIconId: 1, matches: [], sampleSize: 0, wins: 0, losses: 0, winRate: 0, averageKda: 0, favoriteChampions: [], cached: false, updatedAt: 1 };
const player: PlayerSnapshot = { playerId: 'one', displayName: 'Player One', teamId: 100, isLocalTeam: true, lane: 'TOP', championId: 1, scope: 'all', matches: [], sampleSize: 0, wins: 0, losses: 0, winRate: 0, currentChampionGames: 0, currentChampionWins: 0, currentChampionWinRate: 0, status: 'ready', updatedAt: 1 };
const match: LiveMatch = { players: [player], queueId: 450, modeName: '极地大乱斗', positionOrderReliable: false };

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

function install(getLiveMatch: LolViewerApi['getLiveMatch'] = vi.fn().mockResolvedValue(match), order?: string[]) {
  let listener: ((value: PlayerSnapshot, generation?: number) => void) | undefined;
  const unsubscribe = vi.fn();
  const api = {
    getPersonalHistory: vi.fn().mockResolvedValue(history), getLiveMatch,
    onPlayerUpdated: vi.fn((next) => { order?.push('subscribe'); listener = next; return unsubscribe; }),
    cancelLiveMatch: vi.fn().mockResolvedValue(undefined), getChampionGuide: vi.fn().mockRejectedValue(new Error('offline')),
    getSettings: vi.fn().mockResolvedValue({ queueScope: 'ranked-solo', autoOpenLiveMatch: true, showLaneDifferences: true }),
    updateSettings: vi.fn(), clearCache: vi.fn()
  } as unknown as LolViewerApi;
  window.lolViewer = api;
  return { api, unsubscribe, emit: (value: PlayerSnapshot, generation?: number) => listener?.(value, generation) };
}

afterEach(() => { delete window.lolViewer; });

describe('App tab lifecycle', () => {
  it.each(['deferred', 'resolved'] as const)('deduplicates a %s personal history request during StrictMode effect replay', async (kind) => {
    const pending = deferred<PersonalHistorySnapshot>();
    const { api } = install();
    vi.mocked(api.getPersonalHistory).mockImplementation(() => kind === 'deferred' ? pending.promise : Promise.resolve(history));
    render(<StrictMode><App /></StrictMode>);
    if (kind === 'deferred') await act(async () => pending.resolve(history));
    expect(await screen.findByText('召唤师')).toBeVisible();
    expect(api.getPersonalHistory).toHaveBeenCalledOnce();
  });

  it('loads only personal history on startup', async () => {
    const { api } = install(); render(<App />);
    expect(await screen.findByText('召唤师')).toBeVisible();
    expect(api.getPersonalHistory).toHaveBeenCalledOnce();
    expect(api.getLiveMatch).not.toHaveBeenCalled();
  });

  it('subscribes before requesting all modes, then cancels on exit', async () => {
    const order: string[] = []; const request = deferred<LiveMatch>();
    const { api, unsubscribe } = install(vi.fn((scope, generation) => { order.push(`request:${scope}:${generation}`); return request.promise; }), order);
    render(<App />); fireEvent.click(screen.getByRole('tab', { name: '对战信息' }));
    await waitFor(() => expect(order[0]).toBe('subscribe'));
    expect(api.getLiveMatch).toHaveBeenCalledWith('all', expect.any(Number));
    fireEvent.click(screen.getByRole('tab', { name: '英雄资料库' }));
    await waitFor(() => expect(api.cancelLiveMatch).toHaveBeenCalledOnce());
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('absorbs a rejected live cancellation during cleanup', async () => {
    const { api } = install(vi.fn(() => new Promise<LiveMatch>(() => undefined)));
    const rejected = Promise.reject(new Error('cancel failed'));
    void rejected.then(undefined, () => undefined);
    const catchCall = vi.spyOn(rejected, 'catch');
    vi.mocked(api.cancelLiveMatch!).mockReturnValue(rejected);
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    render(<StrictMode><App /></StrictMode>);
    fireEvent.click(screen.getByRole('tab', { name: '对战信息' }));
    await waitFor(() => expect(api.getLiveMatch).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('tab', { name: '战绩' }));
    await waitFor(() => expect(api.cancelLiveMatch).toHaveBeenCalledOnce());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(catchCall).toHaveBeenCalledOnce();
    expect(unhandled).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    window.removeEventListener('unhandledrejection', unhandled);
  });

  it('shows lobby waiting without ten placeholder slots', async () => {
    install(() => new Promise(() => undefined)); render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: '对战信息' }));
    expect(await screen.findByText('等待进入英雄选择或游戏')).toBeVisible();
    expect(screen.queryByTestId('player-slot')).not.toBeInTheDocument();
  });

  it('uses a new generation on re-entry and ignores late events and promises', async () => {
    const first = deferred<LiveMatch>(); const second = deferred<LiveMatch>();
    const { api, emit } = install(vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise));
    render(<App />); fireEvent.click(screen.getByRole('tab', { name: '对战信息' }));
    await waitFor(() => expect(api.getLiveMatch).toHaveBeenCalledTimes(1)); const firstGeneration = vi.mocked(api.getLiveMatch).mock.calls[0][1];
    fireEvent.click(screen.getByRole('tab', { name: '战绩' }));
    await act(async () => first.resolve(match));
    fireEvent.click(screen.getByRole('tab', { name: '对战信息' }));
    await waitFor(() => expect(api.getLiveMatch).toHaveBeenCalledTimes(2)); const secondGeneration = vi.mocked(api.getLiveMatch).mock.calls[1][1];
    expect(secondGeneration).toBeGreaterThan(firstGeneration!);
    act(() => emit({ ...player, displayName: 'stale' }, firstGeneration));
    expect(screen.queryByText('stale')).not.toBeInTheDocument();
    act(() => emit(player, secondGeneration));
    expect(screen.getByText('Player One')).toBeVisible();
  });

  it('shows retryable error only when the request rejects', async () => {
    const request = deferred<LiveMatch>(); install(() => request.promise); render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: '对战信息' }));
    await act(async () => request.reject(new Error('offline')));
    expect(screen.getByRole('alert')).toHaveTextContent('对战信息暂时无法读取，请重试');
  });

  it('shows the resolved match mode and has no scope controls', async () => {
    install(); render(<App />); fireEvent.click(screen.getByRole('tab', { name: '对战信息' }));
    expect(await screen.findByText('极地大乱斗')).toBeVisible();
    expect(screen.queryByRole('button', { name: '全部模式' })).not.toBeInTheDocument();
  });

  it('keeps the champion guide callback stable across parent updates', async () => {
    const { api } = install(); const guide = deferred<Awaited<ReturnType<LolViewerApi['getChampionGuide']>>>();
    vi.mocked(api.getChampionGuide).mockReturnValue(guide.promise); render(<App initialTab="champions" />);
    await waitFor(() => expect(api.getChampionGuide).toHaveBeenCalledOnce());
    await act(async () => guide.reject(new Error('offline')));
    expect(api.getChampionGuide).toHaveBeenCalledOnce();
  });
});

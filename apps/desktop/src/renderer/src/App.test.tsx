import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerSnapshot } from '../../shared/domain';
import type { LiveMatch, LolViewerApi } from '../../shared/ipc';
import App from './App';

const lanes = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;
const players = Array.from({ length: 10 }, (_, index): PlayerSnapshot => ({
  playerId: String(index), displayName: `Player ${index}`, teamId: index < 5 ? 100 : 200,
  lane: lanes[index % 5], championId: index + 1, scope: 'ranked-solo', matches: [], sampleSize: 0,
  wins: 0, losses: 0, winRate: 0, currentChampionGames: 0, currentChampionWins: 0,
  currentChampionWinRate: 0, status: 'ready', updatedAt: 1
}));
const liveMatch: LiveMatch = { players, queueId: 420, modeName: '单双排', positionOrderReliable: true };
const unusedSettingsApi = {
  getSettings: vi.fn().mockResolvedValue({ queueScope: 'ranked-solo', autoOpenLiveMatch: true, showLaneDifferences: true }),
  updateSettings: vi.fn(async (patch) => ({ queueScope: 'ranked-solo', autoOpenLiveMatch: true, showLaneDifferences: true, ...patch })),
  clearCache: vi.fn().mockResolvedValue(undefined),
  getChampionGuide: vi.fn(),
  getPersonalHistory: vi.fn()
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function installApi(getLiveMatch: LolViewerApi['getLiveMatch']) {
  let listener: ((player: PlayerSnapshot, generation?: number) => void) | undefined;
  const unsubscribe = vi.fn();
  const onPlayerUpdated = vi.fn((next: (player: PlayerSnapshot, generation?: number) => void) => { listener = next; return unsubscribe; });
  window.lolViewer = { getLiveMatch, onPlayerUpdated, ...unusedSettingsApi };
  return { onPlayerUpdated, unsubscribe, emit: (player: PlayerSnapshot, generation?: number) => listener?.(player, generation) };
}

afterEach(() => { delete window.lolViewer; });

describe('App', () => {
  it('cancels the active coordinator when auto-open is turned off', async () => {
    installApi(() => new Promise(() => undefined));
    const cancelLiveMatch = vi.fn().mockResolvedValue(undefined);
    window.lolViewer!.cancelLiveMatch = cancelLiveMatch;
    render(<App />);
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Auto-open live match' }));
    await waitFor(() => expect(cancelLiveMatch).toHaveBeenCalledOnce());
  });
  it('loads persisted queue settings and reports cache-clear success', async () => {
    const getLiveMatch = vi.fn().mockResolvedValue({
      players: players.map((player) => ({ ...player, scope: 'all' as const })),
      queueId: 420, modeName: '单双排', positionOrderReliable: true
    });
    installApi(getLiveMatch);
    window.lolViewer!.getSettings = vi.fn().mockResolvedValue({ queueScope: 'all', autoOpenLiveMatch: true, showLaneDifferences: false });
    render(<App />);
    await waitFor(() => expect(getLiveMatch).toHaveBeenCalledWith('all', expect.any(Number)));
    fireEvent.click(screen.getByRole('button', { name: 'Clear cache' }));
    expect(await screen.findByText('Cache cleared')).toBeVisible();
  });
  it('navigates to the champion library while retaining the live page', async () => {
    const getChampionGuide = vi.fn().mockRejectedValue(new Error('offline'));
    installApi(vi.fn().mockResolvedValue(liveMatch));
    window.lolViewer!.getChampionGuide = getChampionGuide;
    render(<App />);
    expect(await screen.findByText('Player 0')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '英雄资料库' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('英雄数据暂不可用');
    expect(screen.getByText('Player 0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回实时对局' }));
    expect(screen.getByText('Player 0')).toBeVisible();
  });

  it('shows initial loading while retaining scope controls', () => {
    installApi(() => new Promise(() => undefined));
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('正在加载单双排对局');
    expect(screen.getByRole('button', { name: '全部模式' })).toBeEnabled();
    expect(screen.getAllByTestId('player-slot')).toHaveLength(10);
  });

  it('subscribes before requesting, renders progress, and unsubscribes', async () => {
    const request = deferred<LiveMatch>();
    const order: string[] = [];
    let listener!: (player: PlayerSnapshot) => void;
    const unsubscribe = vi.fn();
    window.lolViewer = { getLiveMatch: () => { order.push('request'); return request.promise; }, onPlayerUpdated: (next) => { order.push('subscribe'); listener = next; return unsubscribe; }, ...unusedSettingsApi };
    const { unmount } = render(<App />);
    await waitFor(() => expect(order).toEqual(['subscribe', 'request']));
    act(() => listener(players[0]));
    expect(screen.getByText('Player 0')).toBeVisible();
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('shows a request error instead of the waiting-client state', async () => {
    const request = deferred<LiveMatch>();
    installApi(() => request.promise);
    render(<App />);
    await act(async () => request.reject(new Error('offline')));
    expect(screen.getByRole('alert')).toHaveTextContent('加载失败');
    expect(screen.queryByText('等待英雄联盟客户端')).not.toBeInTheDocument();
  });

  it('does not relabel the displayed match during a scope transition', async () => {
    const next = deferred<LiveMatch>();
    const getLiveMatch = vi.fn().mockResolvedValueOnce(liveMatch).mockImplementationOnce(() => next.promise);
    installApi(getLiveMatch);
    render(<App />);
    expect(await screen.findByText('Player 0')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '全部模式' }));
    await waitFor(() => expect(screen.getByText('正在加载全部模式对局')).toBeVisible());
    expect(screen.getByRole('button', { name: '单双排' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Player 0')).toBeVisible();
    await act(async () => next.reject(new Error('offline')));
    expect(screen.getByRole('alert')).toHaveTextContent('全部模式对局加载失败');
    expect(screen.getByRole('button', { name: '单双排' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Player 0')).toBeVisible();
  });
});

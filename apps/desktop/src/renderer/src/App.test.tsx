import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonalHistorySnapshot, PlayerSnapshot } from '../../shared/domain';
import type { LiveMatch, LolViewerApi } from '../../shared/ipc';
import App from './App';

const history: PersonalHistorySnapshot = { playerId: 'me', displayName: '召唤师', profileIconId: 1, matches: [], sampleSize: 0, wins: 0, losses: 0, winRate: 0, averageKda: 0, favoriteChampions: [], cached: false, updatedAt: 1 };
const player: PlayerSnapshot = { playerId: 'one', displayName: 'Player One', teamId: 100, isLocalTeam: true, lane: 'TOP', championId: 1, scope: 'all', matches: [], sampleSize: 0, wins: 0, losses: 0, winRate: 0, currentChampionGames: 0, currentChampionWins: 0, currentChampionWinRate: 0, status: 'ready', updatedAt: 1 };
const match: LiveMatch = { players: [player], gameId: 'game-1', queueId: 450, modeName: '极地大乱斗', positionOrderReliable: false };

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

function install(getLiveMatch: LolViewerApi['getLiveMatch'] = vi.fn().mockResolvedValue(match), order?: string[]) {
  let listener: ((value: PlayerSnapshot, generation?: number) => void) | undefined;
  const unsubscribe = vi.fn();
  const api = {
    getPersonalHistory: vi.fn().mockResolvedValue(history), getLiveMatch,
    getLiveRoster: vi.fn().mockResolvedValue({ ...match, players: match.players.map(({ playerId, displayName, teamId, isLocalTeam, lane, championId }) => ({ playerId, displayName, teamId, isLocalTeam, lane, championId })) }),
    getGameflowPhase: vi.fn().mockResolvedValue('InProgress'),
    getGameflowSessionIdentity: vi.fn().mockResolvedValue({ phase: 'InProgress', gameId: 'game-1' }),
    onPlayerUpdated: vi.fn((next) => { order?.push('subscribe'); listener = next; return unsubscribe; }),
    cancelLiveMatch: vi.fn().mockResolvedValue(undefined), retryLiveMatch: vi.fn().mockResolvedValue(undefined),
    getChampionGuide: vi.fn().mockRejectedValue(new Error('offline')),
    getChampionCatalog: vi.fn().mockResolvedValue([{ id: 114, name: '无双剑姬', title: '菲奥娜', alias: 'Fiora', roles: ['fighter'] }]),
    getChampionDetails: vi.fn().mockResolvedValue({ id: 114, name: '无双剑姬', title: '菲奥娜', alias: 'Fiora', shortBio: '', roles: ['fighter'], abilities: [
      { key: 'P', name: '决斗之舞', description: '', iconPath: '/p.png' }, { key: 'Q', name: '破空斩', description: '', iconPath: '/q.png' },
      { key: 'W', name: '劳伦特心眼刀', description: '', iconPath: '/w.png' }, { key: 'E', name: '夺命连刺', description: '', iconPath: '/e.png' },
      { key: 'R', name: '无双挑战', description: '', iconPath: '/r.png' }
    ] }),
    getSettings: vi.fn().mockResolvedValue({ autoOpenLiveMatch: true, showLaneDifferences: true, autoAcceptReadyCheck: false }),
    updateSettings: vi.fn().mockImplementation(async (patch) => ({ autoOpenLiveMatch: true, showLaneDifferences: true, autoAcceptReadyCheck: false, ...patch })), clearCache: vi.fn()
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

  it('keeps cached personal history visible while refreshing after tab re-entry', async () => {
    const refresh = deferred<PersonalHistorySnapshot>();
    const { api } = install();
    vi.mocked(api.getPersonalHistory)
      .mockResolvedValueOnce(history)
      .mockImplementationOnce(() => refresh.promise);
    render(<App />);
    expect(await screen.findByText(history.displayName)).toBeVisible();

    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[1]);
    fireEvent.click(tabs[0]);

    await waitFor(() => expect(api.getPersonalHistory).toHaveBeenCalledTimes(2));
    expect(screen.getByText(history.displayName)).toBeVisible();
  });
  it('keeps the same history image elements mounted across tab switches', async () => {
    install();
    render(<App />);
    await screen.findByText(history.displayName);
    const avatar = document.querySelector('.personal-history__hero-avatar');
    expect(avatar).toBeInstanceOf(HTMLImageElement);

    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[1]);
    fireEvent.click(tabs[0]);

    expect(document.querySelector('.personal-history__hero-avatar')).toBe(avatar);
  });
  it('refreshes personal history once and shows the replacement snapshot', async () => {
    const refresh = deferred<PersonalHistorySnapshot>();
    const { api } = install();
    vi.mocked(api.getPersonalHistory)
      .mockResolvedValueOnce(history)
      .mockImplementationOnce(() => refresh.promise);
    render(<App />);
    expect(await screen.findByText('召唤师')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(screen.getByRole('button', { name: '刷新中' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '刷新中' }));
    expect(api.getPersonalHistory).toHaveBeenCalledTimes(2);

    await act(async () => refresh.resolve({ ...history, displayName: '更新后的召唤师', wins: 9 }));
    expect(await screen.findByText('更新后的召唤师')).toBeVisible();
    expect(screen.getByRole('button', { name: '刷新' })).toBeEnabled();
  });

  it('keeps the current personal history visible when a manual refresh fails', async () => {
    const refresh = deferred<PersonalHistorySnapshot>();
    const { api } = install();
    vi.mocked(api.getPersonalHistory)
      .mockResolvedValueOnce(history)
      .mockImplementationOnce(() => refresh.promise);
    render(<App />);
    expect(await screen.findByText('召唤师')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    await act(async () => refresh.reject(new Error('offline')));

    expect(screen.getByText('召唤师')).toBeVisible();
    expect(screen.getByText('刷新失败，请重试')).toBeVisible();
  });

  it('navigates to another player history from a match portrait and returns to the local snapshot', async () => {
    const localHistory: PersonalHistorySnapshot = {
      ...history,
      matches: [{
        matchId: 'match-1', queueId: 420, endedAt: 1, durationSeconds: 1200,
        championId: 1, win: true, kills: 2, deaths: 1, assists: 3,
        allyPlayers: [{ championId: 1, playerId: 'me', displayName: '召唤师' }],
        enemyPlayers: [{ championId: 2, playerId: 'other', puuid: 'other-puuid', displayName: '对手' }]
      }],
      sampleSize: 1,
      wins: 1,
      winRate: 1
    };
    const otherHistory: PersonalHistorySnapshot = {
      ...history,
      playerId: 'other',
      displayName: '对手',
      profileIconId: 2
    };
    const { api } = install();
    vi.mocked(api.getPersonalHistory).mockImplementation(async (target) => target ? otherHistory : localHistory);
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '查看 对手 的个人战绩' }));
    expect(await screen.findByRole('heading', { name: '对手' })).toBeVisible();
    expect(api.getPersonalHistory).toHaveBeenLastCalledWith({
      playerId: 'other', puuid: 'other-puuid', displayName: '对手'
    });

    fireEvent.click(screen.getByRole('button', { name: /返回我的战绩/ }));
    expect(await screen.findByRole('heading', { name: '召唤师' })).toBeVisible();
  });

  it('subscribes before requesting all modes, then cancels on exit', async () => {
    const order: string[] = []; const request = deferred<LiveMatch>();
    const { api, unsubscribe } = install(vi.fn((scope, generation) => { order.push(`request:${scope}:${generation}`); return request.promise; }), order);
    render(<App />); fireEvent.click(screen.getByRole('tab', { name: '对战信息' }));
    await waitFor(() => expect(order[0]).toBe('subscribe'));
    expect(api.getLiveMatch).toHaveBeenCalledWith('all', expect.any(Number));
    fireEvent.click(screen.getByRole('tab', { name: '设置' }));
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

  it('shows initial loading progress without ten placeholder slots', async () => {
    install(() => new Promise(() => undefined)); render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: '对战信息' }));
    expect(await screen.findByRole('status', { name: '阵容加载进度 0/10' })).toBeVisible();
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

  it('reuses the loaded match when re-entering the live tab during the same game', async () => {
    const { api } = install();
    render(<App initialTab="live" />);
    expect(await screen.findByText('Player One')).toBeVisible();

    const tabs = screen.getAllByRole('tab');
    fireEvent.click(tabs[0]);
    fireEvent.click(tabs[1]);

    await act(async () => { await Promise.resolve(); });
    expect(api.getLiveMatch).toHaveBeenCalledOnce();
    expect(screen.getByText('Player One')).toBeVisible();
  });
  it('shows retryable error only when the request rejects', async () => {
    const request = deferred<LiveMatch>(); install(() => request.promise); render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: '对战信息' }));
    await act(async () => request.reject(new Error('offline')));
    expect(screen.getByRole('alert')).toHaveTextContent('对战数据暂时无法读取，正在自动重试');
  });

  it('explains when the League client is not connected', async () => {
    install(vi.fn().mockRejectedValue(new Error('League client is unavailable')));
    render(<App initialTab="live" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('未连接到英雄联盟客户端，请先启动客户端');
  });

  it('shows an error without exposing manual live controls', async () => {
    const getLiveMatch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(match);
    const { api } = install(getLiveMatch);
    render(<App initialTab="live" />);
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retry live match' })).not.toBeInTheDocument();
    expect(api.getLiveMatch).toHaveBeenCalledOnce();
    expect(api.retryLiveMatch).not.toHaveBeenCalled();
    expect(api.cancelLiveMatch).not.toHaveBeenCalled();
  });

  it('keeps live controls out of the match page and persists auto accept from settings', async () => {
    const { api } = install();
    render(<App initialTab="live" />);
    expect(screen.queryByRole('switch', { name: /自动接受匹配/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry live match' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '设置' }));
    const autoOpen = await screen.findByRole('switch', { name: /自动打开对战信息/ });
    expect(autoOpen).toBeChecked();
    fireEvent.click(autoOpen);
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ autoOpenLiveMatch: false }));
    const toggle = await screen.findByRole('switch', { name: /自动接受匹配/ });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => expect(api.updateSettings).toHaveBeenCalledWith({ autoAcceptReadyCheck: true }));
    expect(toggle).toBeChecked();
  });

  it('does not cancel a slow live request during champion select and retries after it fails', async () => {
    vi.useFakeTimers();
    try {
      const first = deferred<LiveMatch>();
      const { api } = install(vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValueOnce(match));
      vi.mocked(api.getGameflowSessionIdentity).mockResolvedValue({ phase: 'ChampSelect', gameId: 'game-1' });
      render(<App initialTab="live" />);
      await act(async () => { await Promise.resolve(); });
      expect(api.getLiveMatch).toHaveBeenCalledOnce();

      await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); });
      expect(api.getLiveMatch).toHaveBeenCalledOnce();
      expect(api.cancelLiveMatch).not.toHaveBeenCalled();

      await act(async () => first.reject(new Error('not in game')));
      await act(async () => { vi.advanceTimersByTime(2_999); await Promise.resolve(); });
      expect(api.getLiveMatch).toHaveBeenCalledOnce();
      await act(async () => { vi.advanceTimersByTime(1); await Promise.resolve(); });
      expect(api.getLiveMatch).toHaveBeenCalledTimes(2);
      expect(api.cancelLiveMatch).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops unfinished player enrichment when the game starts and keeps completed players', async () => {
    vi.useFakeTimers();
    try {
      const pending = deferred<LiveMatch>();
      const { api, emit } = install(vi.fn(() => pending.promise));
      vi.mocked(api.getGameflowSessionIdentity).mockResolvedValue({ phase: 'GameStart', gameId: 'game-1' });
      render(<App initialTab="live" />);
      await act(async () => { await Promise.resolve(); });
      const requestGeneration = vi.mocked(api.getLiveMatch).mock.calls[0][1];
      act(() => emit(player, requestGeneration));

      await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); await Promise.resolve(); });

      expect(api.cancelLiveMatch).toHaveBeenCalledOnce();
      expect(screen.getByText('Player One')).toBeVisible();
      expect(screen.getByText('游戏已经开始，已停止后台补全战绩，避免影响游戏性能')).toBeVisible();
      await act(async () => { vi.advanceTimersByTime(30_000); await Promise.resolve(); });
      expect(api.getLiveMatch).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reloads when the phase moves directly from the previous game into a new champion select', async () => {
    vi.useFakeTimers();
    try {
      const nextPlayer = { ...player, playerId: 'two', displayName: 'Player Two', championId: 2 };
      const getLiveMatch = vi.fn().mockResolvedValueOnce(match).mockResolvedValueOnce({ ...match, players: [nextPlayer] });
      const { api } = install(getLiveMatch);
      vi.mocked(api.getLiveRoster).mockResolvedValue({ ...match, players: [{ playerId: 'two', displayName: 'Player Two', teamId: 100, isLocalTeam: true, lane: 'TOP', championId: 2 }] });
      const phaseApi = api as unknown as { getGameflowSessionIdentity: ReturnType<typeof vi.fn> };
      phaseApi.getGameflowSessionIdentity.mockResolvedValueOnce({ phase: 'InProgress', gameId: 'game-1' }).mockResolvedValueOnce({ phase: 'ChampSelect', gameId: 'game-2' });
      render(<App initialTab="live" />);
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByText('Player One')).toBeVisible();

      await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); });
      expect(getLiveMatch).toHaveBeenCalledOnce();
      await act(async () => { vi.advanceTimersByTime(15_000); await Promise.resolve(); await Promise.resolve(); });
      expect(getLiveMatch).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Player Two')).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });
  it('reloads when gameId changes while the gameflow phase stays InProgress', async () => {
    vi.useFakeTimers();
    try {
      const nextPlayer = { ...player, playerId: 'two', displayName: 'Player Two', championId: 2 };
      const getLiveMatch = vi.fn().mockResolvedValueOnce(match).mockResolvedValueOnce({ ...match, players: [nextPlayer] });
      const { api } = install(getLiveMatch);
      const identityApi = api as unknown as { getGameflowSessionIdentity: ReturnType<typeof vi.fn> };
      identityApi.getGameflowSessionIdentity
        .mockResolvedValueOnce({ phase: 'InProgress', gameId: 'game-1' })
        .mockResolvedValueOnce({ phase: 'InProgress', gameId: 'game-2' });
      render(<App initialTab="live" />);
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByText('Player One')).toBeVisible();

      await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); });
      expect(getLiveMatch).toHaveBeenCalledOnce();
      await act(async () => { vi.advanceTimersByTime(15_000); await Promise.resolve(); await Promise.resolve(); });
      expect(getLiveMatch).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Player Two')).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });
  it('keeps the champion-select roster through game start without reloading or blanking it', async () => {
    vi.useFakeTimers();
    try {
      const getLiveMatch = vi.fn().mockResolvedValue(match);
      const { api } = install(getLiveMatch);
      const identityApi = api as unknown as { getGameflowSessionIdentity: ReturnType<typeof vi.fn> };
      identityApi.getGameflowSessionIdentity
        .mockResolvedValueOnce({ phase: 'ChampSelect', gameId: 'game-1' })
        .mockResolvedValueOnce({ phase: 'GameStart', gameId: 'game-1' })
        .mockResolvedValue({ phase: 'InProgress', gameId: 'game-1' });
      render(<App initialTab="live" />);
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByText('Player One')).toBeVisible();

      await act(async () => { vi.advanceTimersByTime(6_000); await Promise.resolve(); await Promise.resolve(); });

      expect(screen.getByText('Player One')).toBeVisible();
      expect(getLiveMatch).toHaveBeenCalledOnce();
      expect(api.cancelLiveMatch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('refreshes only the lightweight roster while champion select remains active', async () => {
    vi.useFakeTimers();
    try {
      const { api } = install();
      vi.mocked(api.getGameflowSessionIdentity).mockResolvedValue({ phase: 'ChampSelect', gameId: 'game-1' });
      render(<App initialTab="live" />);
      await act(async () => { await Promise.resolve(); });

      await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); await Promise.resolve(); });
      expect(api.getLiveRoster).toHaveBeenCalledOnce();
      expect(api.getLiveMatch).toHaveBeenCalledOnce();

      await act(async () => { vi.advanceTimersByTime(1_500); await Promise.resolve(); });
      expect(api.getLiveRoster).toHaveBeenCalledTimes(2);
      expect(api.getLiveMatch).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
  it('retains the previous roster after game end and replaces it when the next match starts', async () => {
    vi.useFakeTimers();
    try {
      const nextPlayer = { ...player, playerId: 'two', displayName: 'Player Two', championId: 2 };
      const nextMatch = { ...match, players: [nextPlayer] };
      const getLiveMatch = vi.fn().mockResolvedValueOnce(match).mockResolvedValueOnce(nextMatch);
      const { api } = install(getLiveMatch);
      vi.mocked(api.getLiveRoster).mockResolvedValue({ ...match, players: [{ playerId: 'two', displayName: 'Player Two', teamId: 100, isLocalTeam: true, lane: 'TOP', championId: 2 }] });
      const phaseApi = api as unknown as { getGameflowSessionIdentity: ReturnType<typeof vi.fn> };
      phaseApi.getGameflowSessionIdentity.mockResolvedValueOnce({ phase: 'EndOfGame', gameId: 'game-1' }).mockResolvedValueOnce({ phase: 'ChampSelect', gameId: 'game-2' });
      render(<App initialTab="live" />);
      await act(async () => { await Promise.resolve(); });
      expect(screen.getByText('Player One')).toBeVisible();

      await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); });
      expect(screen.getByText('Player One')).toBeVisible();
      expect(api.cancelLiveMatch).not.toHaveBeenCalled();

      await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); await Promise.resolve(); });
      expect(getLiveMatch).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Player Two')).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });
  it('shows the resolved match mode and defaults non-ranked matches to all history', async () => {
    install(); render(<App />); fireEvent.click(screen.getByRole('tab', { name: '对战信息' }));
    expect(await screen.findByText('极地大乱斗')).toBeVisible();
    expect(screen.getByRole('button', { name: '全部对局' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '排位对局' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the champion guide callback stable across parent updates', async () => {
    const { api } = install(); const guide = deferred<Awaited<ReturnType<LolViewerApi['getChampionGuide']>>>();
    vi.mocked(api.getChampionGuide).mockReturnValue(guide.promise); render(<App initialTab="champions" />);
    await waitFor(() => expect(api.getChampionGuide).toHaveBeenCalledOnce());
    await act(async () => guide.reject(new Error('offline')));
    expect(api.getChampionGuide).toHaveBeenCalledOnce();
  });

  it('automatically loads personal history once the League client becomes available', async () => {
    vi.useFakeTimers();
    try {
      const { api } = install();
      vi.mocked(api.getGameflowSessionIdentity).mockResolvedValue({ phase: 'None' });
      vi.mocked(api.getPersonalHistory)
        .mockRejectedValueOnce(new Error('League client is unavailable'))
        .mockResolvedValueOnce(history);
      render(<App />);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
      expect(screen.getByText('请先启动英雄联盟客户端')).toBeVisible();
      await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
      expect(screen.getByText('召唤师')).toBeVisible();
      expect(api.getPersonalHistory).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('automatically opens live match when champion select starts', async () => {
    vi.useFakeTimers();
    try {
      const { api } = install();
      vi.mocked(api.getGameflowSessionIdentity)
        .mockResolvedValueOnce({ phase: 'None' })
        .mockResolvedValueOnce({ phase: 'ChampSelect', gameId: 'game-1' });
      render(<App />);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });

      await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); await Promise.resolve(); });
      await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); await Promise.resolve(); });

      expect(screen.getByRole('tab', { name: '对战信息' })).toHaveAttribute('aria-selected', 'true');
      expect(api.getLiveMatch).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('highlights the live tab instead when automatic opening is disabled', async () => {
    vi.useFakeTimers();
    try {
      const { api } = install();
      vi.mocked(api.getSettings).mockResolvedValue({ autoOpenLiveMatch: false, showLaneDifferences: true, autoAcceptReadyCheck: false });
      const identityApi = api as unknown as { getGameflowSessionIdentity: ReturnType<typeof vi.fn> };
      identityApi.getGameflowSessionIdentity
        .mockResolvedValueOnce({ phase: 'None' })
        .mockResolvedValueOnce({ phase: 'ChampSelect', gameId: 'game-1' });
      render(<App />);
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(screen.getByRole('tab', { name: '对战信息' })).not.toHaveClass('app-shell__tab--attention');
      await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); await Promise.resolve(); });
      expect(screen.getByRole('tab', { name: '对战信息' })).not.toHaveClass('app-shell__tab--attention');
      await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); await Promise.resolve(); });
      expect(screen.getByRole('tab', { name: '对战信息' })).toHaveClass('app-shell__tab--attention');
      fireEvent.click(screen.getByRole('tab', { name: '对战信息' }));
      expect(screen.getByRole('tab', { name: '对战信息' })).not.toHaveClass('app-shell__tab--attention');
    } finally {
      vi.useRealTimers();
    }
  });
});

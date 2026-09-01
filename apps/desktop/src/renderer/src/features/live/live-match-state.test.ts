import { describe, expect, it } from 'vitest';
import type { PlayerSnapshot } from '../../../../shared/domain';
import type { LiveMatch } from '../../../../shared/ipc';
import { initialLiveMatchState, liveMatchReducer } from './live-match-state';

const player = {
  playerId: '1', displayName: 'Player', teamId: 100, lane: 'TOP', championId: 1,
  scope: 'all', matches: [], sampleSize: 0, wins: 0, losses: 0, winRate: 0,
  currentChampionGames: 0, currentChampionWins: 0, currentChampionWinRate: 0,
  status: 'ready', updatedAt: 1
} satisfies PlayerSnapshot;
const match = {
  players: [player], queueId: 420, modeName: '单双排', positionOrderReliable: true
} satisfies LiveMatch;

describe('liveMatchReducer', () => {
  it('progresses from loading players to a current snapshot', () => {
    const loading = liveMatchReducer(initialLiveMatchState, { type: 'request-started' });
    const progressive = liveMatchReducer(loading, { type: 'player-updated', player });
    const ready = liveMatchReducer(progressive, { type: 'request-succeeded', match });

    expect(loading).toMatchObject({ status: 'loading', requesting: true });
    expect(progressive.progress).toEqual([player]);
    expect(ready).toMatchObject({ status: 'current', match, progress: [], requesting: false });
  });

  it('retains a stable snapshot across game end and failed background refreshes', () => {
    const ready = liveMatchReducer(initialLiveMatchState, { type: 'request-succeeded', match });
    const last = liveMatchReducer(ready, { type: 'phase-observed', phase: 'EndOfGame', active: false });
    const refreshing = liveMatchReducer(last, { type: 'request-started' });
    const failed = liveMatchReducer(refreshing, { type: 'request-failed' });

    expect(last).toMatchObject({ status: 'last-match', match });
    expect(failed).toMatchObject({ status: 'last-match', match, requesting: false });
  });

  it('clears the previous snapshot only after detecting a new match', () => {
    const ready = liveMatchReducer(initialLiveMatchState, { type: 'request-succeeded', match });
    const next = liveMatchReducer(ready, { type: 'new-match-detected', phase: 'ChampSelect' });
    const loading = liveMatchReducer(next, { type: 'request-started' });

    expect(next).toEqual({
      status: 'new-match-loading', progress: [], requesting: false, phase: 'ChampSelect'
    });
    expect(loading.status).toBe('new-match-loading');
  });

  it('merges champion-select changes without discarding loaded history', () => {
    const historicalPlayer = {
      ...player,
      matches: [{ matchId: 'm1', queueId: 420, endedAt: 1, durationSeconds: 600, championId: 2, win: true, kills: 1, deaths: 1, assists: 1 }]
    };
    const ready = liveMatchReducer(initialLiveMatchState, {
      type: 'request-succeeded',
      match: { ...match, players: [historicalPlayer] }
    });
    const refreshed = liveMatchReducer(ready, {
      type: 'roster-refreshed',
      roster: {
        ...match,
        players: [{ playerId: '1', displayName: 'Player', teamId: 100, lane: 'TOP', championId: 2 }]
      }
    });

    expect(refreshed.match?.players[0]).toMatchObject({ championId: 2, matches: historicalPlayer.matches, currentChampionGames: 1, currentChampionWins: 1, currentChampionWinRate: 1 });
  });
});

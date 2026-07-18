import { describe, expect, it, vi } from 'vitest';
import type { LcuClient } from '../lcu/http-client';
import type { PlayerSnapshot } from '../../shared/domain';
import { MatchService } from './match-service';

const participants = Array.from({ length: 10 }, (_, index) => ({
  summonerId: String(index + 1),
  summonerName: `Player ${index + 1}`,
  teamId: index < 5 ? 100 : 200,
  selectedPosition: 'TOP',
  championId: index + 1
}));

const history = {
  games: [
    {
      gameId: 1,
      queueId: 420,
      gameCreation: 1_000,
      gameDuration: 600,
      participants: [
        {
          championId: 1,
          stats: { win: true, kills: 8, deaths: 3, assists: 4 },
          timeline: { lane: 'TOP' }
        }
      ]
    }
  ]
};

describe('MatchService', () => {
  it('orients team 200 first using the strictly validated current summoner', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5) } };
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 8 };
      if (path.includes('/ranked-stats/')) return { queues: [] };
      return history;
    });
    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', () => undefined);
    expect(result.players.slice(0, 5).every((player) => player.teamId === 200)).toBe(true);
  });

  it('populates solo rank and isolates a single rank lookup failure', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5) } };
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 1 };
      if (path.includes('/ranked-stats/2')) throw new Error('rank offline');
      if (path.includes('/ranked-stats/')) return { queues: [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', division: 'II', leaguePoints: 42 }] };
      return history;
    });
    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', () => undefined);
    expect(result.players[0].rank).toBe('GOLD II 42 LP');
    expect(result.players[1].rank).toBeUndefined();
    expect(result.players[1].matches).toHaveLength(1);
    expect(result.players.slice(2).every((player) => player.rank === 'GOLD II 42 LP')).toBe(true);
  });
  it('propagates a separately validated current asset version to every player', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5) } };
      if (path === '/lol-patch/v1/game-version') return '15.14.1';
      return history;
    });
    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', () => undefined);
    expect(result.players.every((player) => player.assetVersion === '15.14.1')).toBe(true);
  });

  it.each([new Error('offline'), { version: 'invalid' }])('keeps history usable when version lookup is unavailable or invalid', async (versionResult) => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5) } };
      if (path === '/lol-patch/v1/game-version') {
        if (versionResult instanceof Error) throw versionResult;
        return versionResult;
      }
      return history;
    });
    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', () => undefined);
    expect(result.players.every((player) => player.status === 'ready')).toBe(true);
    expect(result.players.every((player) => player.assetVersion === undefined)).toBe(true);
  });
  it('emits nine ready players and one unavailable player without rejecting', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5) } };
      if (path.includes('/5/')) throw Object.assign(new Error('offline'), { code: 'LCU_AUTH' });
      return history;
    });
    const service = new MatchService({ get } as LcuClient, { sleep: async () => undefined });
    const updated: unknown[] = [];

    const result = await service.loadLiveMatch('ranked-solo', updated.push.bind(updated));

    expect(result.players).toHaveLength(10);
    expect(result.players.filter((player) => player.status === 'ready')).toHaveLength(9);
    expect(result.players.filter((player) => player.status === 'unavailable')).toHaveLength(1);
    expect(updated).toHaveLength(10);
  });

  it('limits player history requests to four concurrent calls', async () => {
    let active = 0;
    let maximum = 0;
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5) } };
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return history;
    });
    const service = new MatchService({ get } as LcuClient);
    await service.loadLiveMatch('all', () => undefined);

    expect(maximum).toBe(4);
  });

  it('retries transient failures twice using the required delays', async () => {
    const sleep = vi.fn(async () => undefined);
    let attempts = 0;
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5) } };
      if (path.includes('/1/') && attempts++ < 2) throw Object.assign(new Error('offline'), { code: 'LCU_UNAVAILABLE' });
      return history;
    });
    const service = new MatchService({ get } as LcuClient, { sleep });

    await service.loadLiveMatch('all', () => undefined);

    expect(sleep.mock.calls).toEqual([[250], [750]]);
  });

  it('rejects a structurally invalid nine-player session', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') {
        return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5, 9) } };
      }
      return history;
    });

    await expect(new MatchService({ get } as LcuClient).loadLiveMatch('all', () => undefined))
      .rejects.toThrow();
    expect(get).toHaveBeenCalledOnce();
  });

  it('isolates throwing callbacks while returning all successful players once', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5) } };
      return history;
    });
    const updated: string[] = [];

    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', (player) => {
      updated.push(player.playerId);
      if (player.playerId === '1') throw new Error('renderer gone');
    });

    expect(result.players).toHaveLength(10);
    expect(result.players.every((player) => player.status === 'ready')).toBe(true);
    expect(updated).toHaveLength(10);
    expect(new Set(updated).size).toBe(10);
  });

  it('uses cached players before history calls and caches only successful snapshots', async () => {
    const cached: PlayerSnapshot = {
      playerId: '1', displayName: 'Old', teamId: 200, lane: 'JUNGLE', championId: 1,
      scope: 'ranked-solo', matches: [], sampleSize: 0, wins: 0, losses: 0, winRate: 0,
      currentChampionGames: 0, currentChampionWins: 0, currentChampionWinRate: 0,
      status: 'ready', updatedAt: 1
    };
    const cache = { get: vi.fn((id) => id === '1' ? cached : null), put: vi.fn() };
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5) } };
      if (path.includes('/5/')) throw new Error('unavailable');
      return history;
    });
    const updated: string[] = [];

    const result = await new MatchService({ get } as LcuClient, { cache }).loadLiveMatch('ranked-solo', (player) => updated.push(player.playerId));

    expect(get.mock.calls.some(([path]) => String(path).includes('/1/'))).toBe(false);
    expect(result.players[0].displayName).toBe('Player 1');
    expect(updated).toHaveLength(10);
    expect(cache.put).toHaveBeenCalledTimes(8);
    expect(cache.put.mock.calls.every(([player]) => player.status === 'ready')).toBe(true);
  });

  it.each(['get', 'put'] as const)('keeps live-match loading operational when cache.%s throws', async (operation) => {
    const cache = {
      get: vi.fn(() => {
        if (operation === 'get') throw new Error('cache read failed');
        return null;
      }),
      put: vi.fn(() => {
        if (operation === 'put') throw new Error('cache write failed');
      })
    };
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5) } };
      return history;
    });
    const updated: string[] = [];

    const result = await new MatchService({ get } as LcuClient, { cache })
      .loadLiveMatch('ranked-solo', (player) => updated.push(player.playerId));

    expect(result.players).toHaveLength(10);
    expect(result.players.every((player) => player.status === 'ready')).toBe(true);
    expect(result.players[0].matches).toHaveLength(1);
    expect(updated).toHaveLength(10);
  });
});

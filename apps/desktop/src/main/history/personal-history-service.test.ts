import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';
import type { PersonalHistorySnapshot } from '../../shared/domain';
import { migrateDatabase, PersonalHistoryCache } from '../cache/database';
import type { LcuClient } from '../lcu/http-client';
import { PersonalHistoryService } from './personal-history-service';

function game(index: number) {
  const championId = index < 4 ? 1 : index % 4 + 2;
  return {
    gameId: index + 1, queueId: index % 3 === 0 ? 420 : 430,
    gameCreation: 1_000_000 - index * 10_000, gameDuration: 1_800,
    participants: [{ championId, stats: {
      win: index % 2 === 0, kills: index + 1, deaths: index % 3, assists: 2,
      totalMinionsKilled: 100, item0: 3071
    }, timeline: { lane: 'TOP' } }]
  };
}

const cachedSnapshot: PersonalHistorySnapshot = {
  playerId: '7', displayName: 'Cached Player', profileIconId: 29, matches: [], sampleSize: 0,
  wins: 0, losses: 0, winRate: 0, averageKda: 0, favoriteChampions: [], cached: false,
  itemIconPaths: {},
  historyDataVersion: 4,
  updatedAt: 1_000
};

function createService(get: LcuClient['get']) {
  const database = new Database(':memory:');
  migrateDatabase(database);
  const cache = new PersonalHistoryCache(database);
  return { cache, service: new PersonalHistoryService({ get } as LcuClient, cache) };
}

describe('PersonalHistoryService', () => {
  it('returns a fresh snapshot after identity lookup without requesting history, rank, or patch', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 7, displayName: 'Current', profileIconId: 30 };
      throw new Error(`unexpected request ${path}`);
    }) as LcuClient['get'];
    const cache = { getFresh: vi.fn(() => cachedSnapshot), getLatest: vi.fn(), put: vi.fn() };
    const service = new PersonalHistoryService({ get } as LcuClient, cache);

    await expect(service.load()).resolves.toEqual(cachedSnapshot);
    expect(get).toHaveBeenCalledTimes(1);
    expect(cache.getFresh).toHaveBeenCalledWith('7');
  });
  it('loads twenty matches and computes aggregate KDA and favorites', async () => {
    const games = Array.from({ length: 25 }, (_, index) => game(index));
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 7, displayName: 'Local Player', profileIconId: 29 };
      if (path.includes('/matches?')) return { games };
      if (path.includes('/ranked-stats/')) return { queues: [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', division: 'II', leaguePoints: 42 }] };
      if (path === '/lol-patch/v1/game-version') return '15.14.1';
      if (path === '/lol-game-data/assets/v1/items.json') return [
        { id: 3071, iconPath: '/lol-game-data/assets/ASSETS/Items/Icons2D/3071_Fighter_T3_BlackCleaver.png' }
      ];
      throw new Error('unexpected path');
    }) as LcuClient['get'];
    const { cache, service } = createService(get);

    const result = await service.load();
    const selected = games.slice(0, 20);
    const kills = selected.reduce((sum, item) => sum + item.participants[0].stats.kills, 0);
    const assists = selected.reduce((sum, item) => sum + item.participants[0].stats.assists, 0);
    const deaths = selected.reduce((sum, item) => sum + item.participants[0].stats.deaths, 0);
    expect(result.matches).toHaveLength(20);
    expect(result.averageKda).toBeCloseTo((kills + assists) / Math.max(1, deaths));
    expect(result.favoriteChampions[0]).toMatchObject({
      championId: 1,
      games: 4,
      averageKills: 2.5,
      averageDeaths: 0.75,
      averageAssists: 2
    });
    expect(result).toMatchObject({
      playerId: '7',
      rank: '黄金 II 42 胜点',
      assetVersion: '15.14.1',
      itemIconPaths: {
        3071: '/lol-game-data/assets/ASSETS/Items/Icons2D/3071_Fighter_T3_BlackCleaver.png'
      },
      cached: false
    });
    expect(cache.getLatest('7')).toEqual({ ...result, cached: true });
    expect(get).toHaveBeenCalledWith('/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=40', expect.anything());
  });

  it('loads each game detail when the Tencent history list only contains the local participant', async () => {
    const listedGame = {
      ...game(0),
      participants: [{
        ...game(0).participants[0],
        participantId: 8,
        teamId: 100,
        spell1Id: 4,
        spell2Id: 14
      }]
    };
    const detailedGame = {
      ...listedGame,
      participants: [
        ...Array.from({ length: 9 }, (_, index) => ({
          championId: index + 2,
          participantId: [1, 2, 3, 4, 5, 6, 7, 9, 10][index],
          teamId: index < 4 ? 100 : 200,
          spell1Id: 4,
          spell2Id: 14,
          stats: {
            win: index < 4,
            kills: 1,
            deaths: 1,
            assists: 1
          }
        })),
        listedGame.participants[0]
      ]
    };
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-summoner/v1/current-summoner') {
        return { summonerId: 7, displayName: 'Current', profileIconId: 30 };
      }
      if (path.includes('/matches?')) return { games: [listedGame] };
      if (path === '/lol-match-history/v1/games/1') return detailedGame;
      if (path === '/lol-game-data/assets/v1/items.json') return [];
      throw new Error('optional endpoint offline');
    }) as LcuClient['get'];

    const result = await createService(get).service.load();

    expect(result.matches[0]).toMatchObject({
      championId: listedGame.participants[0].championId,
      kills: listedGame.participants[0].stats.kills,
      allyChampionIds: [listedGame.participants[0].championId, 2, 3, 4, 5],
      enemyChampionIds: [6, 7, 8, 9, 10]
    });
    expect(get).toHaveBeenCalledWith('/lol-match-history/v1/games/1', expect.anything());
  });

  it('refreshes a legacy fresh cache that has no local item icon metadata', async () => {
    const legacySnapshot = { ...cachedSnapshot };
    delete legacySnapshot.itemIconPaths;
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-summoner/v1/current-summoner') {
        return { summonerId: 7, displayName: 'Current', profileIconId: 30 };
      }
      if (path.includes('/matches?')) return { games: [game(0)] };
      if (path === '/lol-game-data/assets/v1/items.json') return [];
      throw new Error('optional endpoint offline');
    }) as LcuClient['get'];
    const cache = { getFresh: vi.fn(() => legacySnapshot), getLatest: vi.fn(), put: vi.fn() };

    const result = await new PersonalHistoryService({ get } as LcuClient, cache).load();

    expect(result.itemIconPaths).toEqual({});
    expect(get).toHaveBeenCalledWith('/lol-game-data/assets/v1/items.json', expect.anything());
  });

  it('refreshes a fresh Tencent cache that only contains the local participant', async () => {
    const legacySnapshot: PersonalHistorySnapshot = {
      ...cachedSnapshot,
      historyDataVersion: 1,
      matches: [{
        matchId: 'old', queueId: 420, endedAt: 1, durationSeconds: 1200,
        championId: 1, win: true, kills: 1, deaths: 1, assists: 1,
        summonerSpellIds: [4, 14],
        allyChampionIds: [1],
        enemyChampionIds: []
      }],
      sampleSize: 1,
      wins: 1,
      winRate: 1
    };
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-summoner/v1/current-summoner') {
        return { summonerId: 7, displayName: 'Current', profileIconId: 30 };
      }
      if (path.includes('/matches?')) return { games: [game(0)] };
      if (path === '/lol-game-data/assets/v1/items.json') return [];
      throw new Error('optional endpoint offline');
    }) as LcuClient['get'];
    const cache = { getFresh: vi.fn(() => legacySnapshot), getLatest: vi.fn(), put: vi.fn() };

    await new PersonalHistoryService({ get } as LcuClient, cache).load();

    expect(get).toHaveBeenCalledWith(
      '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=40',
      expect.anything()
    );
  });

  it('keeps successful history when optional rank and patch requests fail', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: '7', displayName: 'Player', profileIconId: 29 };
      if (path.includes('/matches?')) return { games: [game(0)] };
      throw new Error('optional endpoint offline');
    }) as LcuClient['get'];
    const result = await createService(get).service.load();
    expect(result).not.toHaveProperty('rank');
    expect(result).not.toHaveProperty('assetVersion');
    expect(result.matches).toHaveLength(1);
  });

  it('does not render the Tencent unranked sentinel as NA 0 LP', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 7, displayName: 'Player', profileIconId: 29 };
      if (path.includes('/matches?')) return { games: [game(0)] };
      if (path.includes('/ranked-stats/')) return { queues: [{ queueType: 'RANKED_SOLO_5x5', tier: 'NA', division: '', leaguePoints: 0 }] };
      if (path === '/lol-patch/v1/game-version') return '16.14.1';
      throw new Error('unexpected path');
    }) as LcuClient['get'];

    await expect(createService(get).service.load()).resolves.not.toHaveProperty('rank');
  });

  it('keeps every champion represented in the latest twenty matches', async () => {
    const games = Array.from({ length: 20 }, (_, index) => ({
      ...game(index),
      participants: [{
        ...game(index).participants[0],
        championId: index + 1
      }]
    }));
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 7, displayName: 'Local Player', profileIconId: 29 };
      if (path.includes('/matches?')) return { games };
      if (path.includes('/ranked-stats/')) return { queues: [] };
      if (path === '/lol-patch/v1/game-version') return '15.14.1';
      if (path === '/lol-game-data/assets/v1/items.json') return [];
      throw new Error(`unexpected path ${path}`);
    }) as LcuClient['get'];
    const { service } = createService(get);

    const result = await service.load();

    expect(result.favoriteChampions).toHaveLength(20);
    expect(result.favoriteChampions.reduce((sum, champion) => sum + champion.games, 0)).toBe(20);
  });
  it('returns latest player cache when history becomes unavailable', async () => {
    const { cache, service } = createService((async (path: string) => {
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 7, displayName: 'Player', profileIconId: 29 };
      throw new Error('offline');
    }) as LcuClient['get']);
    cache.put(cachedSnapshot, 1_000);
    await expect(service.load()).resolves.toEqual({ ...cachedSnapshot, cached: true });
  });

  it('returns globally latest cache when LCU cannot identify the current summoner', async () => {
    const { cache, service } = createService((async () => { throw new Error('offline'); }) as LcuClient['get']);
    cache.put(cachedSnapshot, 1_000);
    await expect(service.load()).resolves.toEqual({ ...cachedSnapshot, cached: true });
  });

  it('throws a sanitized unavailable error without cache', async () => {
    const { service } = createService((async () => { throw new Error('network details'); }) as LcuClient['get']);
    await expect(service.load()).rejects.toMatchObject({ message: 'Personal history is unavailable', code: 'HISTORY_UNAVAILABLE' });
  });
});

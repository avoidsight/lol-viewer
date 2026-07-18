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
      totalMinionsKilled: 100
    }, timeline: { lane: 'TOP' } }]
  };
}

const cachedSnapshot: PersonalHistorySnapshot = {
  playerId: '7', displayName: 'Cached Player', profileIconId: 29, matches: [], sampleSize: 0,
  wins: 0, losses: 0, winRate: 0, averageKda: 0, favoriteChampions: [], cached: false,
  updatedAt: 1_000
};

function createService(get: LcuClient['get']) {
  const database = new Database(':memory:');
  migrateDatabase(database);
  const cache = new PersonalHistoryCache(database);
  return { cache, service: new PersonalHistoryService({ get } as LcuClient, cache) };
}

describe('PersonalHistoryService', () => {
  it('loads twenty matches and computes aggregate KDA and favorites', async () => {
    const games = Array.from({ length: 25 }, (_, index) => game(index));
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 7, displayName: 'Local Player', profileIconId: 29 };
      if (path.includes('/matches?')) return { games };
      if (path.includes('/ranked-stats/')) return { queues: [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', division: 'II', leaguePoints: 42 }] };
      if (path === '/lol-patch/v1/game-version') return '15.14.1';
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
    expect(result.favoriteChampions[0]).toMatchObject({ championId: 1, games: 4 });
    expect(result).toMatchObject({ playerId: '7', rank: 'GOLD II 42 LP', assetVersion: '15.14.1', cached: false });
    expect(cache.getLatest('7')).toEqual({ ...result, cached: true });
    expect(get).toHaveBeenCalledWith('/lol-match-history/v1/products/lol/7/matches?begIndex=0&endIndex=40', expect.anything());
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

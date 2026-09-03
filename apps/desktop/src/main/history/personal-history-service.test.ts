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
  historyDataVersion: 7,
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
      if (path === '/lol-summoner/v1/current-summoner') {
        return { summonerId: 7, displayName: '', gameName: 'Local Player', tagLine: 'CN1', profileIconId: 29 };
      }
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
      displayName: 'Local Player#CN1',
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

  it('loads another player by puuid through Tencent SGP without replacing the current summoner', async () => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-game-data/assets/v1/items.json') return [];
      if (path === '/lol-patch/v1/game-version') return '15.14.1';
      throw new Error(`optional endpoint offline: ${path}`);
    }) as LcuClient['get'];
    const richParticipants = Array.from({ length: 10 }, (_, index) => ({
      championId: index === 0 ? 99 : index + 1,
      participantId: index + 1,
      teamId: index < 5 ? 200 : 100,
      ...(index === 0 ? { spell1Id: 4, spell2Id: 12 } : {}),
      stats: {
        win: index < 5,
        kills: index === 0 ? 8 : 1,
        deaths: index === 0 ? 4 : 2,
        assists: index === 0 ? 12 : 3,
        goldEarned: index === 0 ? 14_250 : 10_000,
        totalDamageDealtToChampions: index === 0 ? 31_500 : 10_000,
        totalDamageTaken: index === 0 ? 28_100 : 11_000,
        ...(index === 0 ? { item0: 3071, item1: 3053 } : {})
      }
    }));
    const sgp = {
      getHistory: vi.fn().mockResolvedValue({ games: [{
        ...game(0),
        participants: richParticipants,
        participantIdentities: richParticipants.map((participant, index) => ({
          participantId: participant.participantId,
          player: { puuid: index === 0 ? 'target-puuid' : `other-${index}` }
        }))
      }] }),
      getRankedStats: vi.fn().mockResolvedValue({
        queues: [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', division: 'I', leaguePoints: 77 }]
      })
    };
    const service = new PersonalHistoryService(
      { get } as LcuClient,
      new PersonalHistoryCache(database),
      sgp
    );

    const result = await service.load({
      playerId: 'target-summoner',
      puuid: 'target-puuid',
      displayName: '目标玩家#CN1',
      profileIconId: 88
    });

    expect(result).toMatchObject({
      playerId: 'target-summoner',
      displayName: '目标玩家#CN1',
      profileIconId: 88,
      rank: '黄金 I 77 胜点',
      historyDataVersion: 7
    });
    expect(result.matches[0]).toMatchObject({
      championId: 99,
      summonerSpellIds: [4, 12],
      itemIds: [3071, 3053],
      goldEarned: 14_250,
      totalDamageDealtToChampions: 31_500,
      totalDamageTaken: 28_100
    });
    expect(result.matches[0].teamDamageShare).toBeCloseTo(31_500 / 71_500);
    expect(result.matches[0].teamDamageTakenShare).toBeCloseTo(28_100 / 72_100);
    expect(sgp.getHistory).toHaveBeenCalledWith('target-puuid', 40);
    expect(sgp.getRankedStats).toHaveBeenCalledWith('target-puuid');
    expect(get).not.toHaveBeenCalledWith('/lol-summoner/v1/current-summoner', expect.anything());
    expect(get).not.toHaveBeenCalledWith('/lol-match-history/v1/games/1', expect.anything());
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

  it('uses the target puuid when enriching a Tencent summary that has no performance metrics', async () => {
    const summaryParticipants = Array.from({ length: 10 }, (_, index) => ({
      championId: index === 0 ? 99 : index + 1,
      participantId: index + 1,
      teamId: index < 5 ? 100 : 200,
      stats: { win: index < 5, kills: 1, deaths: 1, assists: 1 }
    }));
    const detailedParticipants = Array.from({ length: 10 }, (_, index) => ({
      championId: index === 7 ? 99 : index + 1,
      participantId: index + 1,
      teamId: index < 5 ? 100 : 200,
      stats: {
        win: index >= 5,
        kills: index === 7 ? 9 : 1,
        deaths: index === 7 ? 3 : 2,
        assists: index === 7 ? 11 : 4,
        goldEarned: index === 7 ? 15_000 : 10_000,
        totalDamageDealtToChampions: index === 7 ? 32_000 : 12_000,
        totalDamageTaken: index === 7 ? 27_000 : 13_000
      }
    }));
    const detailedGame = {
      ...game(0),
      participants: detailedParticipants,
      participantIdentities: detailedParticipants.map((participant) => ({
        participantId: participant.participantId,
        player: { puuid: participant.participantId === 8 ? 'target-puuid' : `other-${participant.participantId}` }
      }))
    };
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-match-history/v1/games/1') return detailedGame;
      if (path === '/lol-game-data/assets/v1/items.json') return [];
      if (path === '/lol-patch/v1/game-version') return '16.17.1';
      throw new Error('optional endpoint offline');
    }) as LcuClient['get'];
    const sgp = {
      getHistory: vi.fn().mockResolvedValue({ games: [{
        ...game(0),
        participants: summaryParticipants,
        participantIdentities: summaryParticipants.map((participant, index) => ({
          participantId: participant.participantId,
          player: { puuid: index === 0 ? 'target-puuid' : `summary-other-${index}` }
        }))
      }] }),
      getRankedStats: vi.fn().mockResolvedValue({ queues: [] })
    };
    const database = new Database(':memory:');
    migrateDatabase(database);

    const result = await new PersonalHistoryService(
      { get } as LcuClient,
      new PersonalHistoryCache(database),
      sgp
    ).load({ playerId: 'target', puuid: 'target-puuid', displayName: '目标玩家', profileIconId: 88 });

    expect(result.matches[0]).toMatchObject({
      championId: 99,
      kills: 9,
      totalDamageDealtToChampions: 32_000,
      totalDamageTaken: 27_000
    });
    expect(get).toHaveBeenCalledWith('/lol-match-history/v1/games/1', expect.anything());
  });

  it('limits game detail enrichment to four concurrent requests in newest-first order', async () => {
    const games = Array.from({ length: 12 }, (_, index) => game(index));
    let active = 0;
    let maximum = 0;
    const started: number[] = [];
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 7, displayName: 'Current', profileIconId: 30 };
      if (path.includes('/matches?')) return { games };
      if (path.includes('/lol-match-history/v1/games/')) {
        const gameId = Number(path.split('/').at(-1));
        started.push(gameId);
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return games.find((entry) => entry.gameId === gameId)!;
      }
      throw new Error('optional endpoint offline');
    }) as LcuClient['get'];

    await createService(get).service.load();

    expect(maximum).toBe(4);
    expect(started.slice(0, 4)).toEqual([1, 2, 3, 4]);
    expect(started).toHaveLength(12);
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

  it('refreshes a version-six target cache that may be missing highest-gold metadata', async () => {
    const legacySnapshot = { ...cachedSnapshot, historyDataVersion: 6 };
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-game-data/assets/v1/items.json') return [];
      if (path === '/lol-patch/v1/game-version') return '16.17.1';
      throw new Error('optional endpoint offline');
    }) as LcuClient['get'];
    const cache = { getFresh: vi.fn(() => legacySnapshot), getLatest: vi.fn(), put: vi.fn() };
    const sgp = {
      getHistory: vi.fn().mockResolvedValue({ games: [game(0)] }),
      getRankedStats: vi.fn().mockResolvedValue({ queues: [] })
    };

    const result = await new PersonalHistoryService({ get } as LcuClient, cache, sgp).load({
      playerId: '7', puuid: 'target-puuid', displayName: '目标玩家', profileIconId: 29
    });

    expect(sgp.getHistory).toHaveBeenCalledWith('target-puuid', 40);
    expect(result.historyDataVersion).toBe(7);
    expect(cache.put).toHaveBeenCalled();
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

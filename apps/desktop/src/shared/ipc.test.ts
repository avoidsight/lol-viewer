import { describe, expect, it } from 'vitest';
import { liveMatchSchema, personalHistorySchema } from './ipc';

const validPlayer = {
  playerId: '1', displayName: 'Player', teamId: 100, lane: 'TOP' as const,
  championId: 1, scope: 'ranked-solo' as const, matches: [], sampleSize: 0,
  wins: 0, losses: 0, winRate: 0, currentChampionGames: 0,
  currentChampionWins: 0, currentChampionWinRate: 0, status: 'ready' as const,
  updatedAt: 1
};

describe('personalHistorySchema', () => {
  it('accepts exactly the validated personal snapshot and rejects unknown fields', () => {
    const value = {
      playerId: '7', displayName: 'Player', profileIconId: 29, rank: 'GOLD II 20 LP',
      matches: [], sampleSize: 0, wins: 0, losses: 0, winRate: 0, averageKda: 0,
      favoriteChampions: [], assetVersion: '16.14.1', cached: false, updatedAt: 1
    };
    expect(personalHistorySchema.parse(value)).toEqual(value);
    expect(() => personalHistorySchema.parse({ ...value, token: 'secret' })).toThrow();
  });

  it('accepts rich optional match details and favorite champion averages', () => {
    const value = {
      playerId: '7', displayName: 'Player', profileIconId: 29,
      matches: [{
        matchId: '1', queueId: 420, endedAt: 1, durationSeconds: 1200,
        championId: 1, win: true, kills: 12, deaths: 4, assists: 18, mvp: true, multiKill: 3,
        itemIds: [3071, 3053], goldEarned: 14_250,
        summonerSpellIds: [4, 12],
        allyChampionIds: [1, 2, 3, 4, 5],
        enemyChampionIds: [6, 7, 8, 9, 10],
        totalDamageDealtToChampions: 31_500, totalDamageTaken: 28_100,
        teamDamageShare: 0.26, teamDamageTakenShare: 0.23, teamGoldShare: 0.26,
        achievements: [
          { type: 'MOST_KILLS', value: 12 },
          { type: 'MOST_ASSISTS', value: 18 },
          { type: 'MOST_DEATHS', value: 9 },
          { type: 'MOST_DAMAGE', value: 31_500 },
          { type: 'MOST_DAMAGE_TAKEN', value: 28_100 },
          { type: 'MOST_GOLD', value: 14_250 },
          { type: 'MOST_CS', value: 226 }
        ]
      }],
      sampleSize: 1, wins: 1, losses: 0, winRate: 1, averageKda: 7.5,
      favoriteChampions: [{
        championId: 1, games: 1, wins: 1, winRate: 1,
        averageKills: 12, averageDeaths: 4, averageAssists: 18
      }],
      cached: false, updatedAt: 1
    };

    expect(personalHistorySchema.parse(value)).toEqual(value);
  });

  it('requires live mode metadata', () => {
    const value = {
      players: Array.from({ length: 10 }, (_, index) => ({
        ...validPlayer, playerId: String(index), teamId: index < 5 ? 100 : 200
      })),
      localTeamId: 100, queueId: 450, modeName: '极地大乱斗', positionOrderReliable: false
    };
    for (const field of ['queueId', 'modeName', 'positionOrderReliable'] as const) {
      const incomplete: Record<string, unknown> = { ...value };
      delete incomplete[field];
      expect(() => liveMatchSchema.parse(incomplete), field).toThrow();
    }
  });
});

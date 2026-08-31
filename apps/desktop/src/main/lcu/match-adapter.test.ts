import { describe, expect, it } from 'vitest';
import fixture from '../../../tests/fixtures/match-history.json';
import { adaptMatchHistory, describeQueue } from './match-adapter';

describe('adaptMatchHistory', () => {
  it('keeps the newest ten solo ranked games and maps KDA', () => {
    const result = adaptMatchHistory(fixture, { scope: 'ranked-solo', limit: 10 });
    expect(result).toHaveLength(10);
    expect(result[0]).toMatchObject({
      championId: 114, win: true, kills: 8, deaths: 3, assists: 4
    });
  });

  it('accepts the actual history response without an invented version envelope', () => {
    expect(adaptMatchHistory({ games: fixture.games.slice(0, 1) }, { scope: 'all', limit: 10 })).toHaveLength(1);
  });

  it('accepts the Tencent history response with nested games metadata', () => {
    const response = {
      accountId: 'redacted',
      games: { gameCount: 1, gameIndexBegin: 0, gameIndexEnd: 1, games: fixture.games.slice(0, 1) },
      platformId: 'HN1'
    };
    expect(adaptMatchHistory(response, { scope: 'all', limit: 10 })).toHaveLength(1);
  });

  it('returns the actual sample when fewer than ten matches exist', () => {
    expect(adaptMatchHistory({ games: fixture.games.slice(0, 3) }, { scope: 'all', limit: 10 })).toHaveLength(3);
  });

  it('returns twenty all-mode matches when requested', () => {
    const queueIds = [420, 430, 440, 450];
    const games = Array.from({ length: 25 }, (_, index) => ({
      ...structuredClone(fixture.games[0]),
      gameId: index,
      gameCreation: (index * 7) % 25,
      queueId: queueIds[index % queueIds.length]
    }));

    const result = adaptMatchHistory({ games }, { scope: 'all', limit: 20 });
    expect(result).toHaveLength(20);
    expect(result[0].matchId).toBe('7');
    expect(result.at(-1)?.matchId).toBe('15');
    expect(new Set(result.map((match) => match.queueId))).toEqual(new Set(queueIds));
  });

  it('maps build and economy stats and awards tied full-game highs', () => {
    const base = structuredClone(fixture.games[0]);
    const local = base.participants[0];
    Object.assign(local.stats, {
      kills: 12,
      assists: 18,
      goldEarned: 14_250,
      totalDamageDealtToChampions: 31_500,
      totalDamageTaken: 28_100,
      item0: 3071,
      item1: 3053,
      item2: 2052,
      item3: 6333,
      item4: 0,
      item5: 0,
      item6: 3078
    });
    Object.assign(local, { teamId: 100, spell1Id: 4, spell2Id: 12 });
    base.participants = [
      local,
      ...Array.from({ length: 9 }, (_, index) => ({
        championId: index + 2,
        teamId: index < 4 ? 100 : 200,
        spell1Id: 4,
        spell2Id: 14,
        stats: {
          win: index < 4,
          kills: index === 0 ? 12 : 5,
          deaths: 4,
          assists: index === 1 ? 18 : 7,
          totalMinionsKilled: 100,
          neutralMinionsKilled: 0,
          goldEarned: 10_000,
          totalDamageDealtToChampions: index === 2 ? 31_500 : 20_000,
          totalDamageTaken: index === 3 ? 35_000 : 20_000
        },
        timeline: { lane: 'TOP' }
      }))
    ];

    const result = adaptMatchHistory({ games: [base] }, { scope: 'all', limit: 10 })[0];
    expect(result).toMatchObject({
      goldEarned: 14_250,
      totalDamageDealtToChampions: 31_500,
      totalDamageTaken: 28_100,
      itemIds: [3071, 3053, 6333],
      summonerSpellIds: [4, 12],
      allyChampionIds: [local.championId, 2, 3, 4, 5],
      enemyChampionIds: [6, 7, 8, 9, 10],
      achievements: [
        { type: 'MOST_KILLS', value: 12 },
        { type: 'MOST_ASSISTS', value: 18 },
        { type: 'MOST_DAMAGE', value: 31_500 }
      ]
    });
    expect(result.teamDamageShare).toBeCloseTo(31_500 / 123_000);
    expect(result.teamDamageTakenShare).toBeCloseTo(28_100 / 123_100);
    expect(result.teamGoldShare).toBeCloseTo(14_250 / 54_250);
  });

  it.each(['championId', 'win', 'kills', 'deaths', 'assists'])('rejects a match missing %s', (field) => {
    const game = structuredClone(fixture.games[0]);
    const target = field === 'championId' ? game.participants[0] : game.participants[0].stats;
    delete (target as Record<string, unknown>)[field];
    expect(() => adaptMatchHistory({ games: [game] }, { scope: 'all', limit: 10 })).toThrow();
  });
});

describe('describeQueue', () => {
  it.each([
    [420, '单双排'],
    [440, '灵活排位'],
    [400, '匹配模式'],
    [430, '匹配模式'],
    [450, '极地大乱斗'],
    [1700, '其他模式']
  ])('labels queue %i', (queueId, expected) => {
    expect(describeQueue(queueId)).toBe(expected);
  });
});

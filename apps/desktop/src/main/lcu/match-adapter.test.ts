import { describe, expect, it } from 'vitest';
import fixture from '../../../tests/fixtures/match-history.json';
import { adaptMatchHistory, describeQueue } from './match-adapter';

describe('adaptMatchHistory', () => {
  it('keeps the newest ten solo ranked games and maps KDA', () => {
    const result = adaptMatchHistory(fixture, { scope: 'ranked-solo', limit: 10 });

    expect(result).toHaveLength(10);
    expect(result[0]).toMatchObject({
      championId: 114,
      win: true,
      kills: 8,
      deaths: 3,
      assists: 4
    });
  });

  it('accepts the actual history response without an invented version envelope', () => {
    expect(adaptMatchHistory({ games: fixture.games.slice(0, 1) }, { scope: 'all', limit: 10 })).toHaveLength(1);
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

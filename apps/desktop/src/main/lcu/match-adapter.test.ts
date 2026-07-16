import { describe, expect, it } from 'vitest';
import fixture from '../../../tests/fixtures/match-history.json';
import { adaptMatchHistory } from './match-adapter';

describe('adaptMatchHistory', () => {
  it('keeps the newest ten solo ranked games and maps KDA', () => {
    const result = adaptMatchHistory(fixture, 'ranked-solo');

    expect(result).toHaveLength(10);
    expect(result[0]).toMatchObject({
      championId: 114,
      win: true,
      kills: 8,
      deaths: 3,
      assists: 4
    });
  });

  it('returns the actual sample when fewer than ten matches exist', () => {
    expect(adaptMatchHistory({ games: fixture.games.slice(0, 3) }, 'all')).toHaveLength(3);
  });

  it.each(['championId', 'win', 'kills', 'deaths', 'assists'])('rejects a match missing %s', (field) => {
    const game = structuredClone(fixture.games[0]);
    const target = field === 'championId' ? game.participants[0] : game.participants[0].stats;
    delete (target as Record<string, unknown>)[field];

    expect(() => adaptMatchHistory({ games: [game] }, 'all')).toThrow();
  });
});

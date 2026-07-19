import { describe, expect, it } from 'vitest';
import { createFixtureAramLiveMatch, createFixtureLiveMatch, createFixturePersonalHistory, fixtureModeEnabled } from './live-match';

describe('fixture live match', () => {
  it('contains ten players with ten history records each', () => {
    const fixture = createFixtureLiveMatch('ranked-solo');
    expect(fixture.players).toHaveLength(10);
    expect(fixture.players.flatMap((player) => player.matches)).toHaveLength(100);
  });

  it('provides a deterministic personal snapshot with twenty matches', () => {
    const first = createFixturePersonalHistory();
    const groups = new Map<number, { games: number; wins: number }>();
    for (const match of first.matches) {
      const group = groups.get(match.championId) ?? { games: 0, wins: 0 };
      group.games += 1;
      if (match.win) group.wins += 1;
      groups.set(match.championId, group);
    }
    const expectedFavorites = [...groups.entries()]
      .map(([championId, group]) => ({
        championId, games: group.games, wins: group.wins, winRate: group.wins / group.games
      }))
      .sort((left, right) => right.games - left.games || left.championId - right.championId)
      .slice(0, 5);
    expect(first.matches).toHaveLength(20);
    expect(first.sampleSize).toBe(20);
    expect(new Set(first.matches.map((match) => match.queueId))).toEqual(new Set([420, 430, 440, 450]));
    expect(first.favoriteChampions).toEqual(expectedFavorites);
    expect(createFixturePersonalHistory()).toEqual(first);
  });

  it('provides deterministic ARAM teams in client roster order rather than lane order', () => {
    const fixture = createFixtureAramLiveMatch('all');
    expect(fixture).toMatchObject({ queueId: 450, modeName: '极地大乱斗', positionOrderReliable: false });
    expect(fixture.players.slice(0, 5).map((player) => player.displayName)).toEqual([
      'ARAM Ally Zoe', 'ARAM Ally Garen', 'ARAM Ally Lux', 'ARAM Ally Ashe', 'ARAM Ally Braum'
    ]);
    expect(fixture.players.slice(5).map((player) => player.displayName)).toEqual([
      'ARAM Enemy Jinx', 'ARAM Enemy Darius', 'ARAM Enemy Ahri', 'ARAM Enemy Lee', 'ARAM Enemy Lulu'
    ]);
    expect(fixture.players.slice(0, 5).map((player) => player.lane)).not.toEqual(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
  });

  it('requires the flag and an explicit test guard in an unpackaged app', () => {
    expect(fixtureModeEnabled(['--fixture-live-match'], false, { PLAYWRIGHT_TEST: '1' })).toBe(true);
    expect(fixtureModeEnabled(['--fixture-aram'], false, { PLAYWRIGHT_TEST: '1' })).toBe(true);
    expect(fixtureModeEnabled([], false, { PLAYWRIGHT_TEST: '1' })).toBe(false);
    expect(fixtureModeEnabled(['--fixture-live-match'], false, {})).toBe(false);
  });

  it('can never run in a packaged production app', () => {
    expect(fixtureModeEnabled(['--fixture-live-match'], true, { PLAYWRIGHT_TEST: '1' })).toBe(false);
    expect(fixtureModeEnabled(['--fixture-aram'], true, { PLAYWRIGHT_TEST: '1' })).toBe(false);
    expect(fixtureModeEnabled(['--fixture-live-match'], true, { NODE_ENV: 'development' })).toBe(false);
  });
});

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { PlayerSnapshot } from '../../shared/domain';
import { MatchCache, migrateDatabase } from './database';

const snapshot: PlayerSnapshot = {
  playerId: 'player-1',
  displayName: 'Player One',
  teamId: 100,
  lane: 'TOP',
  championId: 1,
  scope: 'ranked-solo',
  matches: [],
  sampleSize: 0,
  wins: 0,
  losses: 0,
  winRate: 0,
  currentChampionGames: 0,
  currentChampionWins: 0,
  currentChampionWinRate: 0,
  status: 'ready',
  updatedAt: 1
};

describe('MatchCache', () => {
  it('does not return player history older than fifteen minutes', () => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    const cache = new MatchCache(database);
    const now = 20 * 60_000;

    cache.put(snapshot, now - 16 * 60_000);

    expect(cache.get(snapshot.playerId, 'ranked-solo', now)).toBeNull();
  });

  it('returns player history at the fifteen minute boundary', () => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    const cache = new MatchCache(database);
    const now = 20 * 60_000;

    cache.put(snapshot, now - 15 * 60_000);

    expect(cache.get(snapshot.playerId, 'ranked-solo', now)).toEqual(snapshot);
  });
});

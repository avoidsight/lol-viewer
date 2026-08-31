import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import type { PersonalHistorySnapshot, PlayerSnapshot } from '../../shared/domain';
import { MatchCache, migrateDatabase, PersonalHistoryCache } from './database';

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

  it('isolates player and scope keys and overwrites the same key', () => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    const cache = new MatchCache(database);
    cache.put(snapshot, 1);
    cache.put({ ...snapshot, playerId: 'player-2', displayName: 'Two' }, 1);
    cache.put({ ...snapshot, displayName: 'Updated' }, 2);

    expect(cache.get('player-1', 'ranked-solo', 2)?.displayName).toBe('Updated');
    expect(cache.get('player-2', 'ranked-solo', 2)?.displayName).toBe('Two');
    expect(cache.get('player-1', 'all', 2)).toBeNull();
  });

  it.each([
    ['invalid JSON', '{'],
    ['invalid snapshot', JSON.stringify({ playerId: 'incomplete' })]
  ])('safely ignores %s rows', (_label, payload) => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    database.prepare('INSERT INTO player_snapshots VALUES (?, ?, ?, ?)')
      .run('player-1', 'ranked-solo', payload, 1);

    expect(new MatchCache(database).get('player-1', 'ranked-solo', 2)).toBeNull();
  });

  it('rejects malformed timestamps and future cache entries', () => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    database.prepare('INSERT INTO player_snapshots VALUES (?, ?, ?, ?)')
      .run('player-1', 'ranked-solo', JSON.stringify(snapshot), 1.5);
    expect(new MatchCache(database).get('player-1', 'ranked-solo', 2)).toBeNull();

    database.prepare('UPDATE player_snapshots SET cached_at = ?').run(3);
    expect(new MatchCache(database).get('player-1', 'ranked-solo', 2)).toBeNull();
  });

  it('runs migrations idempotently and records each version once', () => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    migrateDatabase(database);

    expect(database.prepare('SELECT version FROM schema_migrations ORDER BY version').all()).toEqual([{ version: 1 }, { version: 2 }, { version: 3 }, { version: 4 }]);
    expect(database.prepare("SELECT name FROM pragma_table_info('app_settings') WHERE name = ?").get('auto_accept_ready_check'))
      .toEqual({ name: 'auto_accept_ready_check' });
  });
});

const personalSnapshot: PersonalHistorySnapshot = {
  playerId: '7', displayName: 'Local Player', profileIconId: 29, matches: [], sampleSize: 0,
  wins: 0, losses: 0, winRate: 0, averageKda: 0, favoriteChampions: [], cached: false,
  updatedAt: 1_000
};

describe('PersonalHistoryCache', () => {
  it('returns a fresh personal snapshot and marks latest fallback cached', () => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    const cache = new PersonalHistoryCache(database);
    cache.put(personalSnapshot, 1_000);

    expect(cache.getFresh('7', 1_001)).toEqual(personalSnapshot);
    expect(cache.getLatest('7')).toEqual({ ...personalSnapshot, cached: true });
    expect(cache.getLatest()).toEqual({ ...personalSnapshot, cached: true });
  });

  it('uses the globally newest snapshot for offline startup and clears all snapshots', () => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    const cache = new PersonalHistoryCache(database);
    cache.put(personalSnapshot, 1_000);
    cache.put({ ...personalSnapshot, playerId: '8', displayName: 'Newest' }, 2_000);

    expect(cache.getLatest()?.playerId).toBe('8');
    cache.clear();
    expect(cache.getLatest()).toBeNull();
  });

  it('safely ignores stale, future, malformed timestamp, bad JSON, and invalid snapshots', () => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    const cache = new PersonalHistoryCache(database);
    cache.put(personalSnapshot, 1_000);
    expect(cache.getFresh('7', 1_000 + 15 * 60_000 + 1)).toBeNull();
    expect(cache.getFresh('7', 999)).toBeNull();

    database.prepare('UPDATE personal_history_snapshots SET cached_at = ?').run(1.5);
    expect(cache.getFresh('7', 2)).toBeNull();
    database.prepare('UPDATE personal_history_snapshots SET cached_at = ?').run(Date.now() + 60_000);
    expect(cache.getLatest('7')).toBeNull();
    expect(cache.getLatest()).toBeNull();
    database.prepare('UPDATE personal_history_snapshots SET cached_at = ?, snapshot_json = ?').run(1, '{');
    expect(cache.getLatest('7')).toBeNull();
    database.prepare('UPDATE personal_history_snapshots SET snapshot_json = ?').run(JSON.stringify({ playerId: '7' }));
    expect(cache.getLatest('7')).toBeNull();
  });
});

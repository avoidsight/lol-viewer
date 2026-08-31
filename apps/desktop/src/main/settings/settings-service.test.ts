import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { ChampionGuideCache, MatchCache, migrateDatabase, PersonalHistoryCache } from '../cache/database';
import { SettingsService } from './settings-service';

describe('SettingsService', () => {
  it('persists validated partial setting updates', () => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    const service = new SettingsService(database, new MatchCache(database));

    expect(service.update({ autoOpenLiveMatch: false })).toEqual({
      queueScope: 'ranked-solo',
      autoOpenLiveMatch: false,
      showLaneDifferences: true,
      autoAcceptReadyCheck: false
    });
    expect(new SettingsService(database, new MatchCache(database)).get().autoOpenLiveMatch).toBe(false);
    expect(() => service.update({ queueScope: 'invalid' } as never)).toThrow();
  });

  it('persists auto accept ready check as an opt-in setting', () => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    const service = new SettingsService(database, new MatchCache(database));

    expect(service.get().autoAcceptReadyCheck).toBe(false);
    expect(service.update({ autoAcceptReadyCheck: true }).autoAcceptReadyCheck).toBe(true);
    expect(new SettingsService(database, new MatchCache(database)).get().autoAcceptReadyCheck).toBe(true);
  });

  it('does not expose mutable default settings state', () => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    const service = new SettingsService(database, new MatchCache(database));

    (service.get() as { queueScope: string }).queueScope = 'invalid';

    expect(service.get().queueScope).toBe('ranked-solo');
  });

  it('clears history without deleting settings', () => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    const cache = new MatchCache(database);
    const service = new SettingsService(database, cache);
    service.update({ queueScope: 'ranked-solo' });
    cache.put({
      playerId: 'player-1', displayName: 'Player', teamId: 100, lane: 'TOP', championId: 1,
      scope: 'ranked-solo', matches: [], sampleSize: 0, wins: 0, losses: 0, winRate: 0,
      currentChampionGames: 0, currentChampionWins: 0, currentChampionWinRate: 0,
      status: 'ready', updatedAt: 1
    });

    service.clearCache();

    expect(service.get().queueScope).toBe('ranked-solo');
    expect(cache.get('player-1', 'ranked-solo')).toBeNull();
  });

  it('also clears the public champion guide cache on an explicit cache clear', () => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    const guideCache = new ChampionGuideCache(database);
    guideCache.put({ championId: 114, lane: 'TOP', patch: '16.14', source: 'OPGG', region: 'KR', tier: 'EMERALD+', fetchedAt: '2026-07-16T00:00:00.000Z', builds: [], favorable: [], unfavorable: [], notes: [] });
    new SettingsService(database, new MatchCache(database), guideCache).clearCache();
    expect(guideCache.get('16.14', 114, 'TOP')).toBeNull();
  });

  it('also clears personal history on an explicit cache clear', () => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    const personalCache = new PersonalHistoryCache(database);
    personalCache.put({ playerId: '7', displayName: 'Player', profileIconId: 29, matches: [], sampleSize: 0,
      wins: 0, losses: 0, winRate: 0, averageKda: 0, favoriteChampions: [], cached: false, updatedAt: 1 });
    new SettingsService(database, new MatchCache(database), undefined, personalCache).clearCache();
    expect(personalCache.getLatest()).toBeNull();
  });

  it('rejects corrupt persisted boolean values instead of coercing them', () => {
    const database = new Database(':memory:');
    migrateDatabase(database);
    database.prepare(`INSERT INTO app_settings
      (id, queue_scope, auto_open_live_match, show_lane_differences, auto_accept_ready_check)
      VALUES (?, ?, ?, ?, ?)`)
      .run(1, 'ranked-solo', 2, 1, 0);

    expect(() => new SettingsService(database, new MatchCache(database)).get()).toThrow();
  });
});

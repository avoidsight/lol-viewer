import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChampionGuideCache, migrateDatabase } from '../cache/database';
import { ChampionGuideClient } from './champion-guide-client';

const guide = {
  championId: 114, lane: 'TOP' as const, patch: '16.14', source: 'OPGG' as const,
  region: 'KR', tier: 'EMERALD+', fetchedAt: '2026-07-16T00:00:00.000Z',
  builds: [{ itemIds: [3071, 3053], pickRate: 0.42 }],
  favorable: [{ opponentChampionId: 86, winRate: 0.55, games: 120 }],
  unfavorable: [{ opponentChampionId: 24, winRate: 0.46 }], notes: ['三级前稳健换血']
};

describe('ChampionGuideClient', () => {
  let database: Database.Database;
  afterEach(() => database?.close());

  it('returns the last successful guide marked stale when the service is offline', async () => {
    database = new Database(':memory:'); migrateDatabase(database);
    const cache = new ChampionGuideCache(database); cache.put(guide);
    const client = new ChampionGuideClient({ baseUrl: 'https://guides.test', patch: '16.14', cache, fetch: vi.fn().mockRejectedValue(new Error('offline')) });
    await expect(client.getChampionGuide(114, 'TOP')).resolves.toMatchObject({ source: 'OPGG', stale: true });
  });

  it('validates a successful response and caches it as a fresh single-source snapshot', async () => {
    database = new Database(':memory:'); migrateDatabase(database);
    const cache = new ChampionGuideCache(database);
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(guide), { status: 200 }));
    const client = new ChampionGuideClient({ baseUrl: 'https://guides.test/', patch: '16.14', cache, fetch });
    await expect(client.getChampionGuide(114, 'TOP')).resolves.toEqual({ ...guide, stale: false });
    expect(fetch).toHaveBeenCalledWith('https://guides.test/v1/patches/16.14/champions/114?lane=TOP', expect.objectContaining({ headers: { accept: 'application/json' } }));
    expect(cache.get('16.14', 114, 'TOP')).toEqual(guide);
  });

  it('rejects malformed service and cache data instead of fabricating a guide', async () => {
    database = new Database(':memory:'); migrateDatabase(database);
    const cache = new ChampionGuideCache(database);
    const client = new ChampionGuideClient({ baseUrl: 'https://guides.test', patch: '16.14', cache, fetch: vi.fn().mockResolvedValue(new Response('{}')) });
    await expect(client.getChampionGuide(114, 'TOP')).rejects.toThrow('Champion guide unavailable');
  });
});

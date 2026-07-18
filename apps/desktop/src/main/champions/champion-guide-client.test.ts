import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
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
  let databasePath: string | undefined;
  afterEach(() => { database?.close(); if (databasePath && existsSync(databasePath)) unlinkSync(databasePath); vi.useRealTimers(); });

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

  it('aborts a hung request after five seconds and returns the stale snapshot', async () => {
    vi.useFakeTimers();
    database = new Database(':memory:'); migrateDatabase(database);
    const cache = new ChampionGuideCache(database); cache.put(guide);
    const fetch = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const setTimer = vi.fn((callback: () => void, milliseconds: number) => setTimeout(callback, milliseconds));
    const clearTimer = vi.fn((timeout: ReturnType<typeof setTimeout>) => clearTimeout(timeout));
    const client = new ChampionGuideClient({ baseUrl: 'https://guides.test', patch: '16.14', cache, fetch, setTimeout: setTimer, clearTimeout: clearTimer });
    const result = client.getChampionGuide(114, 'TOP');
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).resolves.toMatchObject({ championId: 114, stale: true });
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 5_000);
    expect(clearTimer).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('falls back for non-success service responses', async () => {
    database = new Database(':memory:'); migrateDatabase(database);
    const cache = new ChampionGuideCache(database); cache.put(guide);
    const client = new ChampionGuideClient({ baseUrl: 'https://guides.test', patch: '16.14', cache, fetch: vi.fn().mockResolvedValue(new Response('', { status: 503 })) });
    await expect(client.getChampionGuide(114, 'TOP')).resolves.toMatchObject({ stale: true, source: 'OPGG' });
  });

  it('sanitizes cache failures when the service is unavailable', async () => {
    const cache = { get: vi.fn(() => { throw new Error('sqlite details'); }), put: vi.fn() };
    const client = new ChampionGuideClient({ baseUrl: 'https://guides.test', patch: '16.14', cache, fetch: vi.fn().mockRejectedValue(new Error('network details')) });
    await expect(client.getChampionGuide(114, 'TOP')).rejects.toThrow('Champion guide unavailable');
  });

  it.each([
    ['patch', { ...guide, patch: '16.13' }],
    ['champion', { ...guide, championId: 115 }],
    ['lane', { ...guide, lane: 'MIDDLE' as const }]
  ])('falls back when response %s identity does not match the request', async (_label, responseGuide) => {
    database = new Database(':memory:'); migrateDatabase(database);
    const cache = new ChampionGuideCache(database); cache.put(guide);
    const client = new ChampionGuideClient({ baseUrl: 'https://guides.test', patch: '16.14', cache, fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(responseGuide))) });
    await expect(client.getChampionGuide(114, 'TOP')).resolves.toMatchObject({ championId: 114, lane: 'TOP', patch: '16.14', stale: true });
  });

  it('isolates cache entries by exact patch, champion, and lane', () => {
    database = new Database(':memory:'); migrateDatabase(database);
    const cache = new ChampionGuideCache(database); cache.put(guide);
    expect(cache.get('16.13', 114, 'TOP')).toBeNull();
    expect(cache.get('16.14', 115, 'TOP')).toBeNull();
    expect(cache.get('16.14', 114, 'MIDDLE')).toBeNull();
    expect(cache.get('16.14', 114, 'TOP')).toEqual(guide);
  });

  it('persists the last successful guide across database close and reopen', () => {
    databasePath = join(process.cwd(), `champion-guide-${Date.now()}-${Math.random()}.sqlite`);
    database = new Database(databasePath); migrateDatabase(database);
    new ChampionGuideCache(database).put(guide); database.close();
    database = new Database(databasePath); migrateDatabase(database);
    expect(new ChampionGuideCache(database).get('16.14', 114, 'TOP')).toEqual(guide);
  });
});

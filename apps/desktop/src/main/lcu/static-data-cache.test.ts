import { describe, expect, it, vi } from 'vitest';
import type { LcuClient } from './http-client';
import { LcuStaticDataCache } from './static-data-cache';

describe('LcuStaticDataCache', () => {
  it('shares and reuses asset version and item metadata requests', async () => {
    const get = vi.fn(async (path: string) => path.includes('game-version')
      ? '16.17.1'
      : [
          { id: 1001, iconPath: '/lol-game-data/assets/items/1001.png' },
          { id: 1002, iconPath: '../unsafe.png' }
        ]);
    const client = { get } as LcuClient;
    const cache = new LcuStaticDataCache();

    await expect(Promise.all([
      cache.getAssetVersion(client), cache.getAssetVersion(client)
    ])).resolves.toEqual(['16.17.1', '16.17.1']);
    await expect(Promise.all([
      cache.getItemIconPaths(client), cache.getItemIconPaths(client)
    ])).resolves.toEqual([
      { '1001': '/lol-game-data/assets/items/1001.png' },
      { '1001': '/lol-game-data/assets/items/1001.png' }
    ]);

    expect(get).toHaveBeenCalledTimes(2);
  });

  it('allows a failed first load to be retried', async () => {
    const get = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('16.17.1');
    const cache = new LcuStaticDataCache();

    await expect(cache.getAssetVersion({ get } as LcuClient)).rejects.toThrow('offline');
    await expect(cache.getAssetVersion({ get } as LcuClient)).resolves.toBe('16.17.1');
    expect(get).toHaveBeenCalledTimes(2);
  });
});

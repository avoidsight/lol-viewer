import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLcuAssetHandler, fixtureAssetResponse, lcuAssetPath } from './asset-protocol';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function cacheDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'lol-viewer-assets-'));
  temporaryDirectories.push(directory);
  return directory;
}

const connection = { port: 2999, password: 'secret', protocol: 'https' as const };
const image = (value: string) => ({ body: Buffer.from(value), contentType: 'image/png' });

describe('lcuAssetPath', () => {
  it('maps only numeric champion icon URLs to the LCU asset endpoint', () => {
    expect(lcuAssetPath('lol-asset://champion-icons/99.png')).toBe('/lol-game-data/assets/v1/champion-icons/99.png');
    expect(lcuAssetPath('lol-asset://champion-icons/../items.json')).toBeNull();
    expect(lcuAssetPath('https://champion-icons/99.png')).toBeNull();
  });

  it('maps profile, spell, and validated game-data assets to local LCU paths', () => {
    expect(lcuAssetPath('lol-asset://profile-icons/29.jpg')).toBe('/lol-game-data/assets/v1/profile-icons/29.jpg');
    expect(lcuAssetPath('lol-asset://spell-icons/summoner_flash.png')).toBe('/lol-game-data/assets/DATA/Spells/Icons2D/summoner_flash.png');
    expect(lcuAssetPath('lol-asset://game-data/%2Flol-game-data%2Fassets%2FASSETS%2FItems%2FIcons2D%2F3071.png')).toBe('/lol-game-data/assets/ASSETS/Items/Icons2D/3071.png');
    expect(lcuAssetPath('lol-asset://game-data/%2Flol-game-data%2Fassets%2F..%2Fsecrets.txt')).toBeNull();
  });
});

describe('fixtureAssetResponse', () => {
  it('serves uncached SVG artwork only for valid local asset URLs', async () => {
    const response = fixtureAssetResponse('lol-asset://champion-icons/99.png');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toContain('>99</text>');
    expect(fixtureAssetResponse('lol-asset://champion-icons/not-an-id.png').status).toBe(404);
  });
});

describe('createLcuAssetHandler', () => {
  it('shares one client discovery across many simultaneous image paths', async () => {
    const discover = vi.fn().mockResolvedValue(connection);
    const load = vi.fn(async (_connection, path: string) => image(path));
    const handler = createLcuAssetHandler({ cacheDirectory: await cacheDirectory(), discover, load });

    const responses = await Promise.all(Array.from({ length: 30 }, (_, id) =>
      handler(`lol-asset://champion-icons/${id + 1}.png`)
    ));

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(discover).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledTimes(30);
  });

  it('limits first-run LCU image reads to six concurrent requests', async () => {
    let active = 0;
    let maximum = 0;
    const load = vi.fn(async (_connection, path: string) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return image(path);
    });
    const handler = createLcuAssetHandler({
      cacheDirectory: await cacheDirectory(),
      discover: vi.fn().mockResolvedValue(connection),
      load
    });

    await Promise.all(Array.from({ length: 30 }, (_, id) =>
      handler(`lol-asset://champion-icons/${id + 1}.png`)
    ));

    expect(maximum).toBeLessThanOrEqual(6);
  });
  it('coalesces simultaneous requests for the same image', async () => {
    const discover = vi.fn().mockResolvedValue(connection);
    const load = vi.fn(async () => image('same-image'));
    const handler = createLcuAssetHandler({ cacheDirectory: await cacheDirectory(), discover, load });

    const responses = await Promise.all(Array.from({ length: 10 }, () =>
      handler('lol-asset://champion-icons/99.png')
    ));

    expect(discover).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
    expect(await responses[0].text()).toBe('same-image');
  });

  it('serves a disk-cached image after restart without discovering the client', async () => {
    const directory = await cacheDirectory();
    const first = createLcuAssetHandler({
      cacheDirectory: directory,
      discover: vi.fn().mockResolvedValue(connection),
      load: vi.fn(async () => image('persisted-image'))
    });
    expect((await first('lol-asset://champion-icons/99.png')).status).toBe(200);

    const discover = vi.fn().mockRejectedValue(new Error('must not run'));
    const second = createLcuAssetHandler({
      cacheDirectory: directory,
      discover,
      load: vi.fn(async () => image('network-image'))
    });
    const cached = await second('lol-asset://champion-icons/99.png');

    expect(cached.status).toBe(200);
    expect(await cached.text()).toBe('persisted-image');
    expect(discover).not.toHaveBeenCalled();
  });
});

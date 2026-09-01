import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverLcuConnection, LcuConnectionDiscovery, type LcuConnection } from './discovery';

describe('discoverLcuConnection', () => {
  const temporaryLockfiles = new Set<string>();

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.LCU_LOCKFILE_PATH;
    await Promise.all(
      [...temporaryLockfiles].map((path) => fs.unlink(path).catch(() => undefined))
    );
    temporaryLockfiles.clear();
  });

  it('parses app-port and remoting-auth-token without logging the token', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await discoverLcuConnection([
      { commandLine: '--app-port=53122 --remoting-auth-token=secret' }
    ]);

    expect(result).toEqual({ port: 53122, password: 'secret', protocol: 'https' });
    expect(JSON.stringify([...log.mock.calls, ...error.mock.calls])).not.toContain('secret');
  });

  it('parses Tencent client arguments when each complete argument is quoted', async () => {
    const result = await discoverLcuConnection([
      {
        name: 'LeagueClientUx.exe',
        commandLine:
          'LeagueClientUx.exe "--riotclient-tencent" "--remoting-auth-token=tencent-secret" "--app-port=50846"'
      }
    ]);

    expect(result).toEqual({ port: 50846, password: 'tencent-secret', protocol: 'https' });
  });

  it('captures the Tencent region and RSO platform needed for SGP routing', async () => {
    const result = await discoverLcuConnection([{
      name: 'LeagueClientUx.exe',
      commandLine: 'LeagueClientUx.exe "--region=TENCENT" "--rso-platform-id=HN1" "--remoting-auth-token=secret" "--app-port=50846"'
    }]);

    expect(result).toEqual({
      port: 50846, password: 'secret', protocol: 'https', region: 'TENCENT', rsoPlatformId: 'HN1'
    });
  });

  it('prefers a LeagueClientUx command line over the lockfile', async () => {
    const lockfile = join(tmpdir(), `lcu-lockfile-${process.pid}-${Date.now()}`);
    temporaryLockfiles.add(lockfile);
    await fs.writeFile(lockfile, 'LeagueClient:1:4000:lockfile-secret:https');
    process.env.LCU_LOCKFILE_PATH = lockfile;

    await expect(
      discoverLcuConnection([
        {
          name: 'LeagueClientUx.exe',
          commandLine: '--app-port=53122 --remoting-auth-token=process-secret'
        }
      ])
    ).resolves.toEqual({ port: 53122, password: 'process-secret', protocol: 'https' });

  });

  it('falls back to the configured lockfile path', async () => {
    const lockfile = join(tmpdir(), `lcu-lockfile-${process.pid}-${Date.now()}`);
    temporaryLockfiles.add(lockfile);
    await fs.writeFile(lockfile, 'LeagueClient:1:4567:lockfile-secret:https');
    process.env.LCU_LOCKFILE_PATH = lockfile;

    await expect(discoverLcuConnection([])).resolves.toEqual({
      port: 4567,
      password: 'lockfile-secret',
      protocol: 'https'
    });

  });
});

describe('LcuConnectionDiscovery', () => {
  const connection: LcuConnection = { port: 53122, password: 'secret', protocol: 'https' };

  it('reuses a healthy connection without starting another discovery', async () => {
    const discover = vi.fn(async () => connection);
    const cache = new LcuConnectionDiscovery(discover);

    await expect(cache.get()).resolves.toBe(connection);
    await expect(cache.get()).resolves.toBe(connection);

    expect(discover).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight discovery between concurrent callers', async () => {
    let resolve!: (value: LcuConnection) => void;
    const discover = vi.fn(() => new Promise<LcuConnection>((done) => { resolve = done; }));
    const cache = new LcuConnectionDiscovery(discover);

    const first = cache.get();
    const second = cache.get();
    resolve(connection);

    await expect(Promise.all([first, second])).resolves.toEqual([connection, connection]);
    expect(discover).toHaveBeenCalledTimes(1);
  });

  it('backs off after an unavailable result and retries when the delay expires', async () => {
    let now = 1_000;
    const discover = vi.fn<() => Promise<LcuConnection | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(connection);
    const cache = new LcuConnectionDiscovery(discover, 3_000, () => now);

    await expect(cache.get()).resolves.toBeNull();
    now = 3_999;
    await expect(cache.get()).resolves.toBeNull();
    now = 4_000;
    await expect(cache.get()).resolves.toBe(connection);

    expect(discover).toHaveBeenCalledTimes(2);
  });

  it('rediscovers after the cached connection is invalidated', async () => {
    const replacement = { ...connection, port: 53123 };
    const discover = vi.fn<() => Promise<LcuConnection | null>>()
      .mockResolvedValueOnce(connection)
      .mockResolvedValueOnce(replacement);
    const cache = new LcuConnectionDiscovery(discover);

    await cache.get();
    cache.invalidate(connection);

    await expect(cache.get()).resolves.toBe(replacement);
    expect(discover).toHaveBeenCalledTimes(2);
  });
});

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverLcuConnection } from './discovery';

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

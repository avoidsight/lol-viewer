import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDeviceIdProvider, hashDeviceIdentity, parseMachineGuid } from './device-id';

describe('feedback device identity', () => {
  it('normalizes the system identity but isolates it by app namespace and platform', () => {
    const id = hashDeviceIdentity('win32', ' ABC-123 ');
    expect(id).toMatch(/^[a-f0-9]{64}$/);
    expect(id).toBe(hashDeviceIdentity('win32', 'abc-123'));
    expect(id).not.toBe(hashDeviceIdentity('darwin', 'abc-123'));
    expect(id).not.toContain('abc');
  });
  it('reads both English and Chinese reg output without shell execution', () => {
    expect(parseMachineGuid('HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography\r\n    MachineGuid    REG_SZ    12345678-1234-1234-1234-123456789abc\r\n')).toBe('12345678-1234-1234-1234-123456789abc');
    expect(parseMachineGuid('错误: 找不到指定注册表项')).toBeUndefined();
  });
  it('survives process restart and regenerates the same ID after app data removal', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lol-device-test-'));
    try {
      const read = vi.fn(async () => '12345678-1234-1234-1234-123456789abc');
      const provider = createDeviceIdProvider(directory, 'win32', read);
      const ids = await Promise.all([provider(), provider()]);
      expect(ids[0]).toBe(ids[1]); expect(read).toHaveBeenCalledOnce();
      const saved = await readFile(join(directory, 'device-id'), 'utf8');
      expect(saved).toBe(ids[0]); expect(saved).not.toContain('12345678');
      const unavailable = vi.fn(async () => { throw new Error('unavailable'); });
      expect(await createDeviceIdProvider(directory, 'win32', unavailable)()).toBe(ids[0]);
      expect(unavailable).not.toHaveBeenCalled();
      await rm(join(directory, 'device-id'));
      expect(await createDeviceIdProvider(directory, 'win32', read)()).toBe(ids[0]);
    } finally { await rm(directory, { recursive: true }); }
  });
  it('persists a random fallback rather than changing ID every launch', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lol-device-test-'));
    try {
      const provider = () => createDeviceIdProvider(directory, 'win32', async () => undefined)();
      expect(await provider()).toBe(await provider());
    } finally { await rm(directory, { recursive: true }); }
  });
});

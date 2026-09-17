import { expect, it, vi } from 'vitest';
import { UpdateService } from './service';
import { newerVersion } from '../../shared/updates';
const release = { version: '1.1.0', notes: '修复对局显示\n新增功能', important: true, downloadUrl: '/downloads/12345678-1234-1234-1234-123456789abc' };
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
it('compares numeric versions and rejects invalid or equal versions', () => {
  expect(newerVersion('1.10.0', '1.9.0')).toBe(true);
  for (const version of ['1.0.0', '0.9.9', 'v2.0.0', '1.01.0', '1.0.0-beta']) expect(newerVersion(version, '1.0.0')).toBe(false);
});
it('offers and downloads ordinary updates too', async () => {
  const open = vi.fn(async () => {});
  const service = new UpdateService(true, '1.0.0', open, vi.fn(async () => response({ release: { ...release, important: false } })));
  expect(await service.check()).toMatchObject({ version: '1.1.0', important: false });
  expect(await service.open('1.1.0')).toBe(true); expect(open).toHaveBeenCalledTimes(1);
});
it('only offers newer versions with a valid official download path', async () => {
  for (const value of [null, { ...release, version: '1.0.0' }, { ...release, version: '0.9.0' }, { ...release, downloadUrl: 'https://evil.test/file.exe' }, { ...release, downloadUrl: '/downloads/../evil' }]) {
    const service = new UpdateService(true, '1.0.0', vi.fn(), vi.fn(async () => response({ release: value })));
    expect(await service.check()).toBeNull();
  }
});
it('deduplicates requests and throttles checks, but revalidates explicit download', async () => {
  const request = vi.fn(async () => response({ release })); const open = vi.fn(async () => {});
  const service = new UpdateService(true, '1.0.0', open, request);
  expect(await Promise.all([service.check(), service.check()])).toEqual([{ version: '1.1.0', notes: release.notes, important: true }, { version: '1.1.0', notes: release.notes, important: true }]);
  await service.check(); expect(request).toHaveBeenCalledTimes(1); expect(open).not.toHaveBeenCalled();
  expect(await service.open('1.1.0')).toBe(true);
  expect(open).toHaveBeenCalledWith('https://lol.19950919.me' + release.downloadUrl);
  request.mockImplementation(async () => response({ release: null }));
  expect(await service.open('1.1.0')).toBe(false); expect(open).toHaveBeenCalledTimes(1);
});
it('fails closed for stale versions, network errors, oversized and invalid responses, disables fixtures', async () => {
  const open = vi.fn(async () => {});
  const request = vi.fn(async () => response({ release }));
  expect(await new UpdateService(false, '1.0.0', open, request).check()).toBeNull(); expect(request).not.toHaveBeenCalled();
  expect(await new UpdateService(true, '1.0.0', open, request).open('1.0.1')).toBe(false);
  expect(open).not.toHaveBeenCalled();
  for (const fetcher of [vi.fn(async () => { throw new Error('offline'); }), vi.fn(async () => new Response('x'.repeat(40000), { headers: { 'content-type': 'application/json' } })), vi.fn(async () => new Response('<html>error</html>'))])
    expect(await new UpdateService(true, '1.0.0', open, fetcher).check()).toBeNull();
});

// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { UpdateService } from './service';
import { idleUpdateDownload, newerVersion, type UpdateDownloadState } from '../../shared/updates';
import { downloadPackage } from './package-download';
const bytes = Buffer.from('MZ synthetic installer: never execute');
const release = { version: '1.1.0', notes: '修复对局显示\n新增功能', important: true,
  size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
  downloadUrl: '/downloads/12345678-1234-1234-1234-123456789abc' };
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const packageResponse = (body: Buffer = bytes) => new Response(new Uint8Array(body), {
  headers: { 'content-type': 'application/octet-stream', 'content-length': String(body.length) }
});
let root: string;
const services: UpdateService[] = [];
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'lol-update-test-')); });
afterEach(async () => {
  for (const service of services.splice(0)) { await service.cancel(); service.dispose(); }
  await rm(root, { recursive: true, force: true });
});
function setup(active = true, platform = 'win32') {
  const launch = vi.fn(async (_path: string) => ''); const quit = vi.fn();
  const request = vi.fn<typeof fetch>(async url => String(url).endsWith('/latest') ? response({ release }) : packageResponse());
  const service = new UpdateService(active, '1.0.0', { root, platform, launch, quit }, request);
  services.push(service);
  return { service, request, launch, quit };
}
it('compares numeric versions and rejects invalid or equal versions', () => {
  expect(newerVersion('1.10.0', '1.9.0')).toBe(true);
  for (const version of ['1.0.0', '0.9.9', 'v2.0.0', '1.01.0', '1.0.0-beta']) expect(newerVersion(version, '1.0.0')).toBe(false);
});
it('downloads and verifies a local file, installing only on explicit confirmation', async () => {
  const { service, request, launch, quit } = setup();
  const states: UpdateDownloadState[] = []; service.subscribe(state => states.push(state));
  expect(await service.check()).toEqual({ version: '1.1.0', notes: release.notes, important: true });
  expect(await service.download('1.1.0')).toMatchObject({ phase: 'ready', receivedBytes: bytes.length, totalBytes: bytes.length });
  expect(launch).not.toHaveBeenCalled(); expect(quit).not.toHaveBeenCalled();
  expect(states.map(s => s.phase)).toEqual(['checking', 'downloading', 'downloading', 'verifying', 'ready']);
  expect(JSON.stringify(states)).not.toContain(root);
  const [directory] = await readdir(root);
  expect(await readFile(join(root, directory, 'setup.exe'))).toEqual(bytes);
  expect(request).toHaveBeenCalledWith('https://lol.19950919.me' + release.downloadUrl, expect.objectContaining({ redirect: 'error' }));
  await service.install('1.0.9'); expect(launch).not.toHaveBeenCalled();
  await service.install('1.1.0');
  expect(launch).toHaveBeenCalledWith(join(root, directory, 'setup.exe')); expect(quit).toHaveBeenCalledTimes(1);
  expect(launch.mock.invocationCallOrder[0]).toBeLessThan(quit.mock.invocationCallOrder[0]);
  await service.install('1.1.0'); expect(launch).toHaveBeenCalledTimes(1);
});
it('deduplicates checks and downloads and preserves ready state when offline', async () => {
  const { service, request } = setup();
  await Promise.all([service.check(), service.check()]); await service.check();
  expect(request).toHaveBeenCalledTimes(1);
  const one = service.download('1.1.0'); const two = service.download('1.1.0');
  expect(one).toBe(two); await one; expect(request).toHaveBeenCalledTimes(3);
  await service.download('1.1.0'); expect(request).toHaveBeenCalledTimes(3);
  request.mockRejectedValue(new Error('offline'));
  expect(await service.check()).toMatchObject({ version: '1.1.0' });
});
it('offers ordinary releases, but rejects unsafe or missing package metadata', async () => {
  const { service, request } = setup();
  request.mockResolvedValueOnce(response({ release: { ...release, important: false } }));
  expect(await service.check()).toMatchObject({ important: false });
  for (const value of [null, { ...release, version: '1.0.0' }, { ...release, version: '0.9.0' },
    { ...release, downloadUrl: 'https://evil.test/a.exe' }, { ...release, downloadUrl: '/downloads/../evil' },
    { ...release, sha256: undefined }, { ...release, sha256: 'x'.repeat(64) }, { ...release, size: 300 * 1024 * 1024 }]) {
    request.mockResolvedValueOnce(response({ release: value }));
    expect(await service.download('1.1.0')).toMatchObject({ phase: 'error' });
  }
});
it('blocks fixtures, macOS, stale and invalid versions', async () => {
  for (const [active, platform] of [[false, 'win32'], [true, 'darwin']] as const) {
    const { service, request, launch } = setup(active, platform);
    expect(await service.download('1.1.0')).toMatchObject({ phase: 'error' });
    expect(request).not.toHaveBeenCalled(); expect(launch).not.toHaveBeenCalled();
  }
  const { service, request } = setup();
  await service.download('../../evil'); expect(request).not.toHaveBeenCalled();
  expect(await service.download('1.0.1')).toMatchObject({ phase: 'error' }); expect(request).toHaveBeenCalledTimes(1);
});
it('fails closed for unavailable, oversized, or invalid release responses', async () => {
  for (const fetcher of [async () => { throw new Error('private network error'); },
    async () => new Response('x'.repeat(40000), { headers: { 'content-type': 'application/json' } }),
    async () => new Response('<html>error</html>')]) {
    const { service, request } = setup(); request.mockImplementation(fetcher);
    expect(await service.check()).toBeNull();
  }
});
it('cleans corrupt, truncated, HTML and oversized downloads and allows retry', async () => {
  const { service, request, launch } = setup();
  for (const makeResponse of [() => packageResponse(Buffer.alloc(bytes.length)),
    () => packageResponse(Buffer.concat([bytes.subarray(0, bytes.length - 1), Buffer.from('!')])),
    () => packageResponse(bytes.subarray(0, 3)), () => new Response('<html>not an installer</html>'),
    () => new Response(new Uint8Array(Buffer.concat([bytes, bytes])), { headers: { 'content-type': 'application/octet-stream' } }),
    () => new Response(new Uint8Array(bytes.subarray(0, 3)), { headers: { 'content-type': 'application/octet-stream' } })]) {
    request.mockImplementation(async url => String(url).endsWith('/latest') ? response({ release }) : makeResponse());
    expect(await service.download('1.1.0')).toMatchObject({ phase: 'error', error: '安装包校验失败，请重新下载。' });
    expect(await readdir(root)).toEqual([]); expect(launch).not.toHaveBeenCalled();
  }
  request.mockImplementation(async url => String(url).endsWith('/latest') ? response({ release }) : packageResponse());
  expect(await service.download('1.1.0')).toMatchObject({ phase: 'ready' });
});
it('cancels during manifest validation without starting a package request', async () => {
  const { service, request, launch } = setup();
  let finish!: (value: Response) => void;
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = service.download('1.1.0');
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  const cancel = service.cancel(); finish(response({ release }));
  expect(await pending).toEqual(idleUpdateDownload); expect(await cancel).toEqual(idleUpdateDownload);
  expect(request).toHaveBeenCalledOnce(); expect(launch).not.toHaveBeenCalled(); expect(await readdir(root)).toEqual([]);
});
it('writes multiple chunks including a split executable header without buffering the package', async () => {
  const { service, request } = setup();
  request.mockImplementation(async url => String(url).endsWith('/latest') ? response({ release }) : new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } }), { headers: { 'content-type': 'application/octet-stream' } }));
  expect(await service.download('1.1.0')).toMatchObject({ phase: 'ready' });
  const [directory] = await readdir(root); expect(await readFile(join(root, directory, 'setup.exe'))).toEqual(bytes);
});
it('aborts a stream and cleans partial files before allowing retry', async () => {
  const { service, request, launch } = setup();
  request.mockImplementation(async (url, init) => {
    if (String(url).endsWith('/latest')) return response({ release });
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(bytes.subarray(0, 2)));
      init?.signal?.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true });
    } }), { headers: { 'content-type': 'application/octet-stream' } });
  });
  const pending = service.download('1.1.0');
  await vi.waitFor(() => expect(service.status().receivedBytes).toBe(2));
  expect(await service.cancel()).toEqual(idleUpdateDownload); await pending;
  expect(await readdir(root)).toEqual([]); expect(launch).not.toHaveBeenCalled();
  request.mockImplementation(async url => String(url).endsWith('/latest') ? response({ release }) : packageResponse());
  expect(await service.download('1.1.0')).toMatchObject({ phase: 'ready' });
});
it('rechecks withdrawal and file integrity before launching', async () => {
  for (const mode of ['withdrawn', 'replaced', 'tampered']) {
    const { service, request, launch, quit } = setup(); await service.download('1.1.0');
    if (mode === 'withdrawn') request.mockResolvedValueOnce(response({ release: null }));
    if (mode === 'replaced') request.mockResolvedValueOnce(response({ release: { ...release, version: '1.2.0' } }));
    if (mode === 'tampered') {
      const [directory] = await readdir(root); await writeFile(join(root, directory, 'setup.exe'), Buffer.alloc(bytes.length));
    }
    expect(await service.install('1.1.0')).toMatchObject({ phase: 'error' });
    expect(launch).not.toHaveBeenCalled(); expect(quit).not.toHaveBeenCalled(); expect(await readdir(root)).toEqual([]);
  }
});
it('keeps app and package when installer launch is declined, permitting retry', async () => {
  const { service, launch, quit } = setup(); await service.download('1.1.0');
  launch.mockResolvedValueOnce('user declined elevation');
  expect(await service.install('1.1.0')).toMatchObject({ phase: 'ready', error: expect.stringContaining('安装未启动') });
  expect(quit).not.toHaveBeenCalled(); await service.install('1.1.0'); expect(quit).toHaveBeenCalledTimes(1);
});
it('times out stalled downloads without retaining partial files', async () => {
  const request = vi.fn<typeof fetch>(async (_url, init) => new Response(new ReadableStream({ start(controller) {
    init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason), { once: true });
  } }), { headers: { 'content-type': 'application/octet-stream' } }));
  await expect(downloadPackage({ url: 'https://fixture.test', expected: release, root, request,
    signal: new AbortController().signal, progress: vi.fn(), verifying: vi.fn(), idleTimeoutMs: 30 })).rejects.toThrow('下载超时');
  expect(await readdir(root)).toEqual([]);
});

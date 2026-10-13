import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, open, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

export const MAX_PACKAGE_SIZE = 250 * 1024 * 1024;
export type PackageMetadata = { size: number; sha256: string };
export type DownloadedPackage = { directory: string; path: string };
export class UpdateFailure extends Error {}
const invalidPackage = () => new UpdateFailure('安装包校验失败，请重新下载。');

export async function removePackage(value?: DownloadedPackage): Promise<void> {
  // Only remove the exact private directory created by this download, never its parent.
  if (value) await rm(value.directory, { recursive: true, force: true }).catch(() => {});
}

export async function verifyPackage(path: string, expected: PackageMetadata): Promise<void> {
  const info = await stat(path);
  if (!info.isFile() || info.size !== expected.size) throw invalidPackage();
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest('hex') !== expected.sha256) throw invalidPackage();
}

export async function downloadPackage(options: {
  url: string; expected: PackageMetadata; root: string; request: typeof fetch; signal: AbortSignal;
  progress: (bytes: number) => void; verifying: () => void;
  idleTimeoutMs?: number; totalTimeoutMs?: number;
}): Promise<DownloadedPackage> {
  const { expected, signal } = options;
  const timeout = new AbortController();
  const combined = AbortSignal.any([signal, timeout.signal]);
  const timeoutError = new UpdateFailure('下载超时，请检查网络后重试。');
  const deadline = setTimeout(() => timeout.abort(timeoutError), options.totalTimeoutMs ?? 30 * 60_000);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const touch = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => timeout.abort(timeoutError), options.idleTimeoutMs ?? 30_000);
  };
  let saved: DownloadedPackage | undefined;
  let complete = false;
  try {
    combined.throwIfAborted();
    touch();
    const response = await options.request(options.url, { signal: combined, redirect: 'error', cache: 'no-store' });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new UpdateFailure('安装包暂不可用，请稍后重试。');
    }
    const reader = response.body.getReader();
    try {
      const length = response.headers.get('content-length');
      const contentType = response.headers.get('content-type')?.split(';')[0].trim();
      if ((length !== null && Number(length) !== expected.size)
        || !['application/octet-stream', 'application/x-msdownload', 'application/vnd.microsoft.portable-executable'].includes(contentType ?? '')) throw invalidPackage();
      await mkdir(options.root, { recursive: true });
      const directory = await mkdtemp(join(options.root, 'download-'));
      saved = { directory, path: join(directory, 'setup.exe') };
      const partial = join(directory, 'package.part');
      const file = await open(partial, 'wx', 0o600);
      const hash = createHash('sha256');
      let bytes = 0;
      let header = Buffer.alloc(0);
      try {
        while (true) {
          combined.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          if (!value.length) continue;
          touch();
          bytes += value.length;
          if (bytes > expected.size || bytes > MAX_PACKAGE_SIZE) throw invalidPackage();
          if (header.length < 2) header = Buffer.concat([header, Buffer.from(value.subarray(0, 2 - header.length))]);
          hash.update(value);
          await file.writeFile(value);
          options.progress(bytes);
        }
        combined.throwIfAborted();
        options.verifying();
        if (bytes !== expected.size || header.toString('ascii') !== 'MZ' || hash.digest('hex') !== expected.sha256) throw invalidPackage();
        await file.sync();
      } finally { await file.close(); }
      combined.throwIfAborted();
      await rename(partial, saved.path);
      complete = true;
      return saved;
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  } catch (error) {
    if (timeout.signal.aborted && !signal.aborted) throw timeoutError;
    if ((error as NodeJS.ErrnoException)?.code === 'ENOSPC') throw new UpdateFailure('磁盘空间不足，请清理后重试。');
    throw error;
  } finally {
    clearTimeout(deadline); clearTimeout(idleTimer);
    if (!complete) await removePackage(saved);
  }
}

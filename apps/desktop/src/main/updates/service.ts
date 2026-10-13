import { z } from 'zod';
import { idleUpdateDownload, newerVersion, versionSchema, type AvailableUpdate, type UpdateDownloadState } from '../../shared/updates';
import { downloadPackage, MAX_PACKAGE_SIZE, removePackage, UpdateFailure, verifyPackage, type DownloadedPackage } from './package-download';
const ORIGIN = 'https://lol.19950919.me';
const responseSchema = z.object({ release: z.object({
  version: versionSchema, notes: z.string().max(5000), important: z.boolean(),
  size: z.number().int().min(2).max(MAX_PACKAGE_SIZE), sha256: z.string().regex(/^[a-f0-9]{64}$/i).transform(value => value.toLowerCase()),
  downloadUrl: z.string().regex(/^\/downloads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
}).nullable() });
type Release = NonNullable<z.infer<typeof responseSchema>['release']>;
export class UpdateService {
  private cached: Release | null = null;
  private checkedAt = -Infinity;
  private pending?: Promise<Release | null>;
  private state: UpdateDownloadState = { ...idleUpdateDownload };
  private listeners = new Set<(state: UpdateDownloadState) => void>();
  private transfer?: Promise<UpdateDownloadState>;
  private abort?: AbortController;
  private downloaded?: DownloadedPackage & { release: Release };
  private disposed = false;
  private installing = false;
  constructor(private active: boolean, private version: string,
    private installer: { root: string; launch: (path: string) => Promise<string>; quit: () => void; platform: string }, private request: typeof fetch = fetch,
    private now = Date.now) {}
  status(): UpdateDownloadState { return { ...this.state }; }
  subscribe(listener: (state: UpdateDownloadState) => void): () => void {
    this.listeners.add(listener); return () => { this.listeners.delete(listener); };
  }
  private setState(state: UpdateDownloadState) {
    this.state = state;
    for (const listener of this.listeners) { try { listener(this.status()); } catch { /* Closed renderer. */ } }
  }
  private async load(): Promise<Release | null> {
    try {
      const response = await this.request(`${ORIGIN}/api/releases/latest`, { signal: AbortSignal.timeout(8000), redirect: 'error', cache: 'no-store' });
      if (!response.ok || !response.body || !response.headers.get('content-type')?.startsWith('application/json')
        || Number(response.headers.get('content-length') ?? 0) > 32768) return null;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.length; if (size > 32768) throw new Error('Oversized release'); chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      const { release } = responseSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      return release && newerVersion(release.version, this.version) ? release : null;
    } catch { return null; }
  }
  private latest(force = false): Promise<Release | null> {
    if (!this.active) return Promise.resolve(null);
    if (this.pending) return this.pending;
    if (!force && this.now() - this.checkedAt < 300000) return Promise.resolve(this.cached);
    this.pending = this.load().then(value => { this.cached = value; this.checkedAt = this.now(); return value; })
      .finally(() => { this.pending = undefined; });
    return this.pending;
  }
  async check(): Promise<AvailableUpdate | null> {
    // Do not switch versions under an in-progress download or hide a ready installer on a network failure.
    if (this.state.phase !== 'idle' && this.state.phase !== 'error' && this.cached && this.cached.version === this.state.version) {
      const { version, notes, important } = this.cached; return { version, notes, important };
    }
    const release = await this.latest();
    return release ? { version: release.version, notes: release.notes, important: release.important } : null;
  }
  download(version: string): Promise<UpdateDownloadState> {
    if (this.transfer) return this.transfer;
    if (this.installing || this.disposed || !versionSchema.safeParse(version).success) return Promise.resolve(this.status());
    if (this.downloaded?.release.version === version && this.state.phase === 'ready') return Promise.resolve(this.status());
    this.abort = new AbortController();
    this.setState({ ...idleUpdateDownload, version, phase: 'checking' });
    this.transfer = this.runDownload(version, this.abort.signal).finally(() => { this.transfer = undefined; this.abort = undefined; });
    return this.transfer;
  }
  private async runDownload(version: string, signal: AbortSignal): Promise<UpdateDownloadState> {
    try {
      if (!this.active || this.installer.platform !== 'win32') throw new UpdateFailure('仅 Windows 安装版支持应用内更新。');
      await removePackage(this.downloaded); this.downloaded = undefined;
      const release = await this.latest(true);
      signal.throwIfAborted();
      if (!release || release.version !== version) throw new UpdateFailure('版本已变化或网络不可用，请稍后重新检查。');
      this.setState({ phase: 'downloading', version, receivedBytes: 0, totalBytes: release.size });
      let notifiedAt = -Infinity;
      const saved = await downloadPackage({
        url: `${ORIGIN}${release.downloadUrl}`, expected: release, root: this.installer.root, request: this.request, signal,
        progress: receivedBytes => {
          this.state = { ...this.state, receivedBytes };
          if (this.now() - notifiedAt >= 200 || receivedBytes === release.size) {
            notifiedAt = this.now(); this.setState(this.state);
          }
        },
        verifying: () => this.setState({ ...this.state, phase: 'verifying' })
      });
      this.downloaded = { ...saved, release };
      signal.throwIfAborted();
      this.setState({ ...this.state, phase: 'ready' });
    } catch (error) {
      await removePackage(this.downloaded); this.downloaded = undefined;
      this.setState(signal.aborted ? { ...idleUpdateDownload } : {
        ...this.state, phase: 'error', error: error instanceof UpdateFailure ? error.message : '下载失败，请检查网络后重试。'
      });
    }
    return this.status();
  }
  async cancel(): Promise<UpdateDownloadState> {
    if (this.installing) return this.status();
    this.abort?.abort();
    await this.transfer;
    await removePackage(this.downloaded); this.downloaded = undefined;
    this.setState({ ...idleUpdateDownload });
    return this.status();
  }
  async install(version: string): Promise<UpdateDownloadState> {
    const saved = this.downloaded;
    if (!this.active || this.disposed || this.installing || this.transfer || this.installer.platform !== 'win32'
      || !saved || saved.release.version !== version || this.state.phase !== 'ready') return this.status();
    this.installing = true;
    this.setState({ ...this.state, phase: 'installing', error: undefined });
    let verified = false;
    try {
      const latest = await this.latest(true);
      if (!latest || latest.version !== version || latest.sha256 !== saved.release.sha256 || latest.downloadUrl !== saved.release.downloadUrl
        || latest.size !== saved.release.size) throw new UpdateFailure('版本已变化或网络不可用，请重新检查后下载。');
      await verifyPackage(saved.path, latest);
      if (this.disposed) return this.status();
      verified = true;
      const error = await this.installer.launch(saved.path);
      if (error) throw new UpdateFailure('安装未启动，请允许 Windows 安装提示后重试。');
      this.installer.quit();
    } catch (error) {
      this.installing = false;
      if (!verified) { await removePackage(this.downloaded); this.downloaded = undefined; }
      this.setState({ ...this.state, phase: verified ? 'ready' : 'error',
        error: error instanceof UpdateFailure ? error.message : '安装未启动，请重试。' });
    }
    return this.status();
  }
  dispose(): void {
    this.disposed = true; this.abort?.abort(); this.listeners.clear();
    // Once launched, the installer must remain available while it copies its payload.
    if (!this.installing) void removePackage(this.downloaded);
  }
}

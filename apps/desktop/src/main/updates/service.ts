import { z } from 'zod';
import { newerVersion, versionSchema, type AvailableUpdate } from '../../shared/updates';
const ORIGIN = 'https://lol.19950919.me';
const responseSchema = z.object({ release: z.object({
  version: versionSchema, notes: z.string().max(5000), important: z.boolean(),
  downloadUrl: z.string().regex(/^\/downloads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
}).nullable() });
type Release = NonNullable<z.infer<typeof responseSchema>['release']>;
export class UpdateService {
  private cached: Release | null = null;
  private checkedAt = -Infinity;
  private pending?: Promise<Release | null>;
  constructor(private active: boolean, private version: string,
    private openExternal: (url: string) => Promise<void>, private request: typeof fetch = fetch,
    private now = Date.now) {}
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
    const release = await this.latest();
    return release ? { version: release.version, notes: release.notes, important: release.important } : null;
  }
  async open(version: string): Promise<boolean> {
    if (!versionSchema.safeParse(version).success) return false;
    const release = await this.latest(true);
    if (!release || release.version !== version) return false;
    try { await this.openExternal(`${ORIGIN}${release.downloadUrl}`); return true; } catch { return false; }
  }
}

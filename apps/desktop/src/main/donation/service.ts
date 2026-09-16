import { donationConfigSchema, type DonationConfig } from '../../shared/donation';
const ENDPOINT = 'https://lol.19950919.me/api/donation';
const OFF: DonationConfig = { enabled: false, revision: 1 };

async function readLimited(response: Response, limit: number): Promise<Buffer> {
  if (!response.ok || !response.body || Number(response.headers.get('content-length') ?? 0) > limit) throw new Error('Invalid response');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error('Response too large');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export class DonationService {
  private pending?: Promise<DonationConfig>;
  private imagePending?: Promise<string | null>;
  constructor(private active: boolean, private request: typeof fetch = fetch) {}
  getConfig(): Promise<DonationConfig> {
    if (!this.active) return Promise.resolve(OFF);
    if (this.pending) return this.pending;
    this.pending = this.loadConfig().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async loadConfig(): Promise<DonationConfig> {
    try {
      const response = await this.request(ENDPOINT, { signal: AbortSignal.timeout(8000), redirect: 'error', cache: 'no-store' });
      if (!response.headers.get('content-type')?.startsWith('application/json')) return OFF;
      return donationConfigSchema.parse(JSON.parse((await readLimited(response, 1024)).toString('utf8')));
    } catch { return OFF; }
  }
  getImage(): Promise<string | null> {
    if (this.imagePending) return this.imagePending;
    this.imagePending = this.loadImage().finally(() => { this.imagePending = undefined; });
    return this.imagePending;
  }
  private async loadImage(): Promise<string | null> {
    try {
      const config = await this.getConfig();
      if (!config.enabled) return null;
      const response = await this.request(`${ENDPOINT}/image?revision=${config.revision}`, { signal: AbortSignal.timeout(8000), redirect: 'error', cache: 'no-store' });
      if (response.headers.get('content-type') !== 'image/png') return null;
      const data = await readLimited(response, 2 * 1024 * 1024);
      if (!data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
      return `data:image/png;base64,${data.toString('base64')}`;
    } catch { return null; }
  }
}

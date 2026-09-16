export interface UsageReport {
  deviceId: string;
  clientVersion: string;
  osName: string;
  osVersion: string;
  arch: string;
}
export const TELEMETRY_ENDPOINT = 'https://lol.19950919.me/api/telemetry';
const DAY = 86400000;
const day = (now: number) => Math.floor((now + 8 * 3600000) / DAY);

/** One small request at startup and per Beijing day; no polling/game data. */
export class UsageReporter {
  private enabled = false;
  private generation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private controller?: AbortController;
  private lastAttemptDay = -1;
  constructor(private readonly context: () => Promise<UsageReport>, private readonly request: typeof fetch = fetch) {}

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.generation++;
    clearTimeout(this.timer);
    this.controller?.abort();
    if (enabled) this.schedule(10000, 0, this.generation);
  }
  resume(): void {
    if (this.enabled && day(Date.now()) !== this.lastAttemptDay) {
      this.generation++;
      this.controller?.abort();
      this.schedule(10000, 0, this.generation);
    }
  }
  dispose(): void { this.setEnabled(false); }
  private schedule(delay: number, attempt: number, generation: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.send(attempt, generation), delay);
    this.timer.unref?.();
  }
  private async send(attempt: number, generation: number): Promise<void> {
    if (!this.enabled || generation !== this.generation) return;
    this.lastAttemptDay = day(Date.now());
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    let retry = false;
    try {
      const payload = await this.context();
      if (controller.signal.aborted || generation !== this.generation || !this.enabled) return;
      const response = await this.request(TELEMETRY_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: controller.signal, redirect: 'error',
      });
      // Never consume arbitrary response bodies or surface telemetry failures.
      await response.body?.cancel();
      retry = response.status >= 500;
    } catch { retry = true; }
    finally { clearTimeout(timeout); }
    if (!this.enabled || generation !== this.generation) return;
    if (retry && attempt < 2) this.schedule(attempt === 0 ? 30000 : 120000, attempt + 1, generation);
    else this.schedule((day(Date.now()) + 1) * DAY - 8 * 3600000 - Date.now() + 10000, 0, generation);
  }
}

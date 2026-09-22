import { enemyHistorySummary } from '../../shared/enemy-history';
import type { GameflowSessionIdentity, LiveMatch } from '../../shared/ipc';

export const GAME_INPUT_SHORTCUT = 'Control+Alt+V';
export function inputText(text: string): string {
  const clean = text.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!clean || clean.startsWith('/')) return '';
  // Local conservative bound, not a claim about the game's current chat limit.
  let result = '';
  for (const point of clean) {
    if (result.length + point.length > 179) return result + '…';
    if (/^[\uD800-\uDFFF]$/.test(point)) continue;
    result += point;
  }
  return result;
}

type Dependencies = {
  identity(): Promise<GameflowSessionIdentity>;
  type(text: string, signal: AbortSignal, validate: () => Promise<boolean>): Promise<void>;
  notify(message: string): void;
  now?: () => number;
};
export class GameInputController {
  private enabled = false;
  private summary?: { gameId: string; text: string; at: number };
  private active?: AbortController;
  private lastAttempt = -Infinity;
  private epoch = 0;
  constructor(private readonly deps: Dependencies) {}
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) { this.epoch++; this.active?.abort(); this.summary = undefined; }
  }
  observe(match: LiveMatch, signal?: AbortSignal): void {
    if (!this.enabled || signal?.aborted) return;
    const text = enemyHistorySummary(match);
    if (this.summary?.gameId !== match.gameId) this.active?.abort();
    this.summary = text && match.gameId ? { gameId: match.gameId, text: inputText(text), at: this.now() } : undefined;
  }
  private now(): number { return this.deps.now?.() ?? Date.now(); }
  async trigger(): Promise<void> {
    if (!this.enabled || this.active || this.now() - this.lastAttempt < 3000) return;
    this.lastAttempt = this.now();
    const summary = this.summary;
    if (!summary?.text || this.now() - summary.at > 2 * 60 * 60_000) {
      this.deps.notify('请先在对战页加载本局战绩。'); return;
    }
    const epoch = this.epoch;
    const abort = new AbortController();
    this.active = abort;
    const timeout = setTimeout(() => abort.abort(), 12_000);
    const validate = async () => {
      const identity = await this.deps.identity();
      return this.enabled && !abort.signal.aborted && this.epoch === epoch && this.summary?.gameId === summary.gameId
        && identity.connected !== false && identity.gameId === summary.gameId && identity.phase === 'InProgress';
    };
    try {
      if (!await validate()) { this.deps.notify('当前对局不可填入，请重新加载本局战绩。'); return; }
      await this.deps.type(summary.text, abort.signal, validate);
    } catch {
      if (!abort.signal.aborted) this.deps.notify('未能完成填入，请检查游戏聊天框；可以关闭实验功能，继续使用复制。');
    } finally { clearTimeout(timeout); if (this.active === abort) this.active = undefined; }
  }
  dispose(): void { this.setEnabled(false); }
}

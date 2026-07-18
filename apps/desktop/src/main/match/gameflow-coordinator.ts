import type { PlayerSnapshot, QueueScope } from '../../shared/domain';
import type { LiveMatch } from '../../shared/ipc';

type Load = (scope: QueueScope, onPlayer: (player: PlayerSnapshot) => void) => Promise<LiveMatch>;

export class GameflowCoordinator {
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private wake: (() => void) | undefined;
  private retryRequested = false;
  private generation = 0;
  private readonly intervalMs: number;

  constructor(private readonly attempt: Load, options: { intervalMs?: number } = {}) {
    this.intervalMs = options.intervalMs ?? 2_000;
  }

  async loadLiveMatch(scope: QueueScope, onPlayer: (player: PlayerSnapshot) => void): Promise<LiveMatch> {
    const generation = ++this.generation;
    this.wake?.();
    while (!this.disposed && generation === this.generation) {
      try {
        return await this.attempt(scope, onPlayer);
      } catch {
        if (this.retryRequested) { this.retryRequested = false; continue; }
        await new Promise<void>((resolve) => {
          this.wake = resolve;
          this.timer = setTimeout(resolve, this.intervalMs);
        });
        this.clearWait();
      }
    }
    return new Promise<LiveMatch>(() => undefined);
  }

  retry(): void {
    if (this.wake) this.wake(); else this.retryRequested = true;
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.wake?.();
    this.clearWait();
  }

  private clearWait(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.wake = undefined;
  }
}

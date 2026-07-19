import type { PlayerSnapshot, QueueScope } from '../../shared/domain';
import type { LiveMatch } from '../../shared/ipc';

type Load = (scope: QueueScope, onPlayer: (player: PlayerSnapshot) => void, signal: AbortSignal) => Promise<LiveMatch>;

export interface MatchCancelledError extends Error { code: 'MATCH_CANCELLED' }
function cancelled(): MatchCancelledError {
  return Object.assign(new Error('Live match request cancelled'), { code: 'MATCH_CANCELLED' as const });
}

export class GameflowCoordinator {
  private disposed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private wake: (() => void) | undefined;
  private retryRequested = false;
  private generation = 0;
  private activeController: AbortController | undefined;
  private activeCancellation: { generation: number; reject: (error: MatchCancelledError) => void } | undefined;
  private readonly intervalMs: number;

  constructor(private readonly attempt: Load, options: { intervalMs?: number } = {}) {
    this.intervalMs = options.intervalMs ?? 2_000;
  }

  async loadLiveMatch(scope: QueueScope, onPlayer: (player: PlayerSnapshot) => void): Promise<LiveMatch> {
    this.cancelActive();
    const generation = ++this.generation;
    const controller = new AbortController();
    this.activeController = controller;
    this.retryRequested = false;
    const cancellation = new Promise<never>((_resolve, reject) => {
      this.activeCancellation = { generation, reject };
    });
    try {
      while (!this.disposed && generation === this.generation) {
        try {
          const guardedOnPlayer = (player: PlayerSnapshot): void => {
            if (!this.disposed && generation === this.generation && !controller.signal.aborted) onPlayer(player);
          };
          return await Promise.race([this.attempt(scope, guardedOnPlayer, controller.signal), cancellation]);
        } catch (error) {
          if ((error as Partial<MatchCancelledError>)?.code === 'MATCH_CANCELLED') throw error;
        if (this.retryRequested) { this.retryRequested = false; continue; }
        const backoff = new Promise<void>((resolve) => {
          this.wake = resolve;
          this.timer = setTimeout(resolve, this.intervalMs);
        });
        await Promise.race([backoff, cancellation]);
        this.clearWait();
        }
      }
      throw cancelled();
    } finally {
      if (this.activeCancellation?.generation === generation) this.activeCancellation = undefined;
      if (this.activeController === controller) this.activeController = undefined;
    }
  }

  retry(): void {
    if (this.wake) this.wake(); else this.retryRequested = true;
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.cancelActive();
    this.wake?.();
    this.clearWait();
  }

  cancel(): void {
    this.generation += 1;
    this.cancelActive();
    this.wake?.();
    this.clearWait();
  }

  private clearWait(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.wake = undefined;
  }

  private cancelActive(): void {
    this.activeController?.abort();
    this.activeController = undefined;
    this.retryRequested = false;
    const active = this.activeCancellation;
    this.activeCancellation = undefined;
    active?.reject(cancelled());
  }
}

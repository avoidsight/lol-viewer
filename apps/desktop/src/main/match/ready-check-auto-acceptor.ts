import { z } from 'zod';
import type { LcuConnection } from '../lcu/discovery';
import type { LcuClient } from '../lcu/http-client';

type TimerHandle = ReturnType<typeof setTimeout> | number;

interface ReadyCheckAutoAcceptorOptions {
  getSettings(): { autoAcceptReadyCheck: boolean };
  discover(): Promise<LcuConnection | null>;
  createClient(connection: LcuConnection): {
    get: LcuClient['get'];
    post(path: string): Promise<void>;
  };
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancel?: (handle: TimerHandle) => void;
  intervalMs?: number;
}

const gameflowPhaseSchema = z.string().min(1);

export class ReadyCheckAutoAcceptor {
  private readonly schedule: NonNullable<ReadyCheckAutoAcceptorOptions['schedule']>;
  private readonly cancel: NonNullable<ReadyCheckAutoAcceptorOptions['cancel']>;
  private readonly intervalMs: number;
  private timer: TimerHandle | undefined;
  private started = false;
  private handledReadyCheck = false;

  constructor(private readonly options: ReadyCheckAutoAcceptorOptions) {
    this.schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.cancel = options.cancel ?? ((handle) => clearTimeout(handle));
    this.intervalMs = options.intervalMs ?? 1_000;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.scheduleNext();
  }

  dispose(): void {
    this.started = false;
    if (this.timer !== undefined) this.cancel(this.timer);
    this.timer = undefined;
  }

  private scheduleNext(): void {
    if (!this.started) return;
    this.timer = this.schedule(() => void this.poll(), this.intervalMs);
  }

  private async poll(): Promise<void> {
    this.timer = undefined;
    try {
      if (!this.options.getSettings().autoAcceptReadyCheck) {
        this.handledReadyCheck = false;
        return;
      }
      const connection = await this.options.discover();
      if (!connection) {
        this.handledReadyCheck = false;
        return;
      }
      const client = this.options.createClient(connection);
      const phase = await client.get('/lol-gameflow/v1/gameflow-phase', gameflowPhaseSchema);
      if (phase !== 'ReadyCheck') {
        this.handledReadyCheck = false;
        return;
      }
      if (this.handledReadyCheck) return;
      this.handledReadyCheck = true;
      await client.post('/lol-matchmaking/v1/ready-check/accept');
    } catch {
      // LCU is transient; a failed poll must never affect the rest of the app.
    } finally {
      this.scheduleNext();
    }
  }
}

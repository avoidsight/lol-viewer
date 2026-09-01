import { describe, expect, it, vi } from 'vitest';
import type { LcuConnection } from '../lcu/discovery';
import type { LcuClient } from '../lcu/http-client';
import { ReadyCheckAutoAcceptor } from './ready-check-auto-acceptor';

const connection: LcuConnection = { port: 53122, password: 'secret', protocol: 'https' };

function harness(enabled = true) {
  let callback: (() => void) | undefined;
  const delays: number[] = [];
  const cancel = vi.fn();
  const discover = vi.fn(async () => connection);
  const get = vi.fn<() => Promise<string>>(async () => 'ReadyCheck');
  const post = vi.fn(async () => undefined);
  const acceptor = new ReadyCheckAutoAcceptor({
    getSettings: () => ({ autoAcceptReadyCheck: enabled }),
    discover,
    createClient: () => ({ get: get as unknown as LcuClient['get'], post }),
    schedule: (next, delayMs) => { callback = next; delays.push(delayMs); return 1; },
    cancel
  });
  const runNext = async () => {
    const next = callback;
    callback = undefined;
    next?.();
    await vi.waitFor(() => expect(callback).toBeTypeOf('function'));
  };
  return { acceptor, discover, get, post, cancel, delays, runNext, setPhase: (phase: string) => get.mockResolvedValueOnce(phase) };
}

describe('ReadyCheckAutoAcceptor', () => {
  it('does not connect while the opt-in setting is disabled', async () => {
    const { acceptor, discover, runNext } = harness(false);
    acceptor.start();
    await runNext();
    expect(discover).not.toHaveBeenCalled();
  });

  it('accepts once per ReadyCheck and resets after leaving that phase', async () => {
    const { acceptor, post, runNext, setPhase } = harness();
    acceptor.start();
    await runNext();
    await runNext();
    expect(post).toHaveBeenCalledTimes(1);

    setPhase('Lobby');
    await runNext();
    setPhase('ReadyCheck');
    await runNext();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('isolates LCU errors and keeps polling', async () => {
    const { acceptor, discover, runNext } = harness();
    discover.mockRejectedValueOnce(new Error('offline'));
    acceptor.start();
    await runNext();
    await runNext();
    expect(discover).toHaveBeenCalledTimes(2);
  });

  it('slows polling while a game is in progress', async () => {
    const { acceptor, delays, runNext, setPhase } = harness();
    setPhase('InProgress');
    acceptor.start();

    await runNext();

    expect(delays).toEqual([1_000, 15_000]);
  });

  it('cancels its scheduled poll when disposed', async () => {
    const { acceptor, cancel, runNext } = harness();
    acceptor.start();
    await runNext();
    acceptor.dispose();
    expect(cancel).toHaveBeenCalledWith(1);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { GameflowCoordinator } from './gameflow-coordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('GameflowCoordinator', () => {
  it.each(['replace', 'cancel', 'dispose'] as const)('promptly cancels a hung attempt on %s and ignores late settlement', async (action) => {
    const hung = deferred<{ players: [] }>();
    const replacementHung = deferred<{ players: [] }>();
    let calls = 0;
    const coordinator = new GameflowCoordinator(() => calls++ === 0 ? hung.promise : replacementHung.promise);
    const old = coordinator.loadLiveMatch('all', () => undefined);
    await Promise.resolve();
    let replacement: Promise<unknown> | undefined;
    if (action === 'replace') replacement = coordinator.loadLiveMatch('ranked-solo', () => undefined);
    else if (action === 'cancel') coordinator.cancel();
    else coordinator.dispose();
    await expect(old).rejects.toMatchObject({ code: 'MATCH_CANCELLED', message: 'Live match request cancelled' });
    if (action === 'replace') {
      hung.resolve({ players: [] });
      coordinator.cancel();
      await expect(replacement).rejects.toMatchObject({ code: 'MATCH_CANCELLED' });
      replacementHung.reject(new Error('late-replacement-rejection'));
    } else {
      hung.reject(new Error('late-secret-rejection'));
      await Promise.resolve();
    }
  });
  it('recovers after startup-before-client and supports explicit retry', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ players: [] });
    const coordinator = new GameflowCoordinator(load, { intervalMs: 1_000 });
    const first = coordinator.loadLiveMatch('all', () => undefined);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(first).resolves.toEqual({ players: [] });
    load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ players: [] });
    const retrying = coordinator.loadLiveMatch('all', () => undefined);
    await Promise.resolve();
    coordinator.retry();
    await expect(retrying).resolves.toEqual({ players: [] });
    coordinator.dispose();
    vi.useRealTimers();
  });

  it('stops polling on teardown', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockRejectedValue(new Error('offline'));
    const coordinator = new GameflowCoordinator(load, { intervalMs: 1_000 });
    const pending = coordinator.loadLiveMatch('all', () => undefined);
    await vi.advanceTimersByTimeAsync(1_000);
    coordinator.dispose();
    await expect(pending).rejects.toMatchObject({ code: 'MATCH_CANCELLED', message: 'Live match request cancelled' });
    const calls = load.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(load).toHaveBeenCalledTimes(calls);
    vi.useRealTimers();
  });

  it('settles the replaced scope request with a sanitized cancellation error', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockRejectedValue(new Error('offline-secret'));
    const coordinator = new GameflowCoordinator(load, { intervalMs: 1_000 });
    const old = coordinator.loadLiveMatch('all', () => undefined);
    await Promise.resolve();
    const replacement = coordinator.loadLiveMatch('ranked-solo', () => undefined);
    await expect(old).rejects.toMatchObject({ code: 'MATCH_CANCELLED', message: 'Live match request cancelled' });
    expect(String(await old.catch((error) => error))).not.toContain('offline-secret');
    coordinator.dispose();
    await expect(replacement).rejects.toMatchObject({ code: 'MATCH_CANCELLED' });
    vi.useRealTimers();
  });
});

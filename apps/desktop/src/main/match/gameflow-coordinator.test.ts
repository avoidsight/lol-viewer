import { describe, expect, it, vi } from 'vitest';
import { GameflowCoordinator } from './gameflow-coordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('GameflowCoordinator', () => {
  it('drops late player events from cancelled generations while forwarding the replacement generation', async () => {
    const attempts: Array<{ onPlayer: (player: any) => void; signal: AbortSignal; result: ReturnType<typeof deferred<any>> }> = [];
    const coordinator = new GameflowCoordinator((_scope, onPlayer, signal) => {
      const result = deferred<any>();
      attempts.push({ onPlayer, signal, result });
      return result.promise;
    });
    const oldEvents: string[] = [];
    const newEvents: string[] = [];
    const old = coordinator.loadLiveMatch('all', (player) => oldEvents.push(player.playerId));
    await Promise.resolve();
    const replacement = coordinator.loadLiveMatch('all', (player) => newEvents.push(player.playerId));
    await expect(old).rejects.toMatchObject({ code: 'MATCH_CANCELLED' });
    attempts[0].onPlayer({ playerId: 'stale' });
    attempts[1].onPlayer({ playerId: 'current' });
    expect(attempts[0].signal.aborted).toBe(true);
    expect(attempts[1].signal.aborted).toBe(false);
    expect(oldEvents).toEqual([]);
    expect(newEvents).toEqual(['current']);
    coordinator.cancel();
    await expect(replacement).rejects.toMatchObject({ code: 'MATCH_CANCELLED' });
  });
  it.each(['replace', 'cancel', 'dispose'] as const)('promptly cancels a hung attempt on %s and ignores late settlement', async (action) => {
    const hung = deferred<{ players: []; queueId: 420; modeName: '单双排'; positionOrderReliable: true }>();
    const replacementHung = deferred<{ players: []; queueId: 420; modeName: '单双排'; positionOrderReliable: true }>();
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
      hung.resolve({ players: [], queueId: 420, modeName: '单双排', positionOrderReliable: true });
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
    const liveMatch = { players: [], queueId: 420, modeName: '单双排', positionOrderReliable: true } as const;
    const load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(liveMatch);
    const coordinator = new GameflowCoordinator(load, { intervalMs: 1_000 });
    const first = coordinator.loadLiveMatch('all', () => undefined);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(first).resolves.toEqual(liveMatch);
    load.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(liveMatch);
    const retrying = coordinator.loadLiveMatch('all', () => undefined);
    await Promise.resolve();
    coordinator.retry();
    await expect(retrying).resolves.toEqual(liveMatch);
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

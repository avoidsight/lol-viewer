import { describe, expect, it, vi } from 'vitest';
import { GameflowCoordinator } from './gameflow-coordinator';

describe('GameflowCoordinator', () => {
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
    void coordinator.loadLiveMatch('all', () => undefined);
    await vi.advanceTimersByTimeAsync(1_000);
    coordinator.dispose();
    const calls = load.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(load).toHaveBeenCalledTimes(calls);
    vi.useRealTimers();
  });
});

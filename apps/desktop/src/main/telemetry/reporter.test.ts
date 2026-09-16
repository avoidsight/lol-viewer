import { afterEach, describe, expect, it, vi } from 'vitest';
import { UsageReporter, TELEMETRY_ENDPOINT } from './reporter';
const context = async () => ({ deviceId: 'a'.repeat(64), clientVersion: '1.0.0', osName: 'win32', osVersion: '10.0', arch: 'x64' });
afterEach(() => vi.useRealTimers());
describe('UsageReporter', () => {
  it('reports after waking on another day, without repeated same-day sends', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-16T01:00:00Z'));
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const reporter = new UsageReporter(context, request); reporter.setEnabled(true);
    await vi.advanceTimersByTimeAsync(10000); reporter.resume();
    await vi.advanceTimersByTimeAsync(10000); expect(request).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-09-17T01:00:00Z')); reporter.resume();
    await vi.advanceTimersByTimeAsync(10000); expect(request).toHaveBeenCalledTimes(2); reporter.dispose();
  });
  it('delays startup, sends once per day and stops on opt-out', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-16T15:59:00Z'));
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const reporter = new UsageReporter(context, request);
    reporter.setEnabled(true);
    expect(request).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10000);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe(TELEMETRY_ENDPOINT);
    await vi.advanceTimersByTimeAsync(60000);
    expect(request).toHaveBeenCalledTimes(2);
    reporter.setEnabled(false);
    await vi.advanceTimersByTimeAsync(86400000);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('bounds failures to three attempts and does not retry 4xx', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockRejectedValue(new Error('offline'));
    const reporter = new UsageReporter(context, request); reporter.setEnabled(true);
    await vi.advanceTimersByTimeAsync(200000);
    expect(request).toHaveBeenCalledTimes(3); reporter.dispose();
    const denied = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    const other = new UsageReporter(context, denied); other.setEnabled(true);
    await vi.advanceTimersByTimeAsync(200000);
    expect(denied).toHaveBeenCalledTimes(1); other.dispose();
  });
  it('does not send after disabling while identity is being read', async () => {
    vi.useFakeTimers();
    let resolve!: (v: Awaited<ReturnType<typeof context>>) => void;
    const request = vi.fn();
    const reporter = new UsageReporter(() => new Promise(r => { resolve = r; }), request);
    reporter.setEnabled(true); await vi.advanceTimersByTimeAsync(10000);
    reporter.setEnabled(false); resolve(await context()); await vi.advanceTimersByTimeAsync(1);
    expect(request).not.toHaveBeenCalled();
  });
  it('aborts an in-flight request when disabled', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockImplementation((_url, init) => new Promise((_r, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))));
    const reporter = new UsageReporter(context, request); reporter.setEnabled(true);
    await vi.advanceTimersByTimeAsync(10000); reporter.dispose();
    expect(request.mock.calls[0][1].signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(200000); expect(request).toHaveBeenCalledTimes(1);
  });
});

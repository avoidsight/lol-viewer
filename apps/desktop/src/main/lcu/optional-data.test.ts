import { afterEach, expect, it, vi } from 'vitest';
import { optionalWithin } from './optional-data';

afterEach(() => vi.useRealTimers());
it('uses fast metadata without waiting for the deadline', async () => {
  vi.useFakeTimers();
  expect(await optionalWithin(Promise.resolve('value'))).toBe('value');
  expect(vi.getTimerCount()).toBe(0);
});
it('bounds optional metadata and handles a rejection arriving after timeout', async () => {
  vi.useFakeTimers();
  let reject!: (reason: Error) => void;
  const result = optionalWithin(new Promise((_resolve, no) => { reject = no; }));
  await vi.advanceTimersByTimeAsync(1500);
  expect(await result).toBeUndefined();
  reject(new Error('late optional failure'));
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
});
it('settles and removes its timer immediately on cancellation', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const result = optionalWithin(new Promise(() => {}), controller.signal);
  controller.abort();
  expect(await result).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});
it('handles an already cancelled waiter and still consumes late rejection', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  controller.abort();
  expect(await optionalWithin(Promise.reject(new Error('optional')), controller.signal)).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});

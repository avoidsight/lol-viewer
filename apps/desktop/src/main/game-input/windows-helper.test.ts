import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { typeWithWindowsHelper as runHelper } from './windows-helper';
const spawnMock = vi.fn();
const typeWithWindowsHelper: typeof runHelper = (text, signal, validate) => runHelper(text, signal, validate, spawnMock);
function child() {
  const process = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), kill: vi.fn(), exitCode: null as number | null });
  spawnMock.mockReturnValue(process as never);
  return process;
}
afterEach(() => vi.useRealTimers());
describe('Windows helper transport', () => {
  it('sends only base64 data after ready and fresh validation', async () => {
    const p = child(); const validate = vi.fn(async () => true); const input: Buffer[] = [];
    p.stdin.on('data', data => input.push(data));
    const task = typeWithWindowsHelper('战绩 $() " 中文😀', new AbortController().signal, validate);
    expect(validate).not.toHaveBeenCalled(); expect(input).toHaveLength(0);
    p.stdout.write('READY\r\n'); await vi.waitFor(() => expect(input.length).toBe(1));
    expect(Buffer.from(input[0].toString().trim(), 'base64').toString()).toBe('战绩 $() " 中文😀');
    expect(JSON.stringify(spawnMock.mock.calls.at(-1))).not.toContain('战绩');
    p.exitCode = 0; p.emit('close', 0); await task;
  });
  it('kills the process on cancellation and sends no text', async () => {
    const p = child(); const abort = new AbortController();
    const task = typeWithWindowsHelper('战绩', abort.signal, async () => true);
    const check = expect(task).rejects.toThrow('cancelled'); abort.abort(); await check;
    expect(p.kill).toHaveBeenCalledOnce();
  });
  it('kills a stalled helper on timeout', async () => {
    vi.useFakeTimers(); const p = child();
    const task = typeWithWindowsHelper('战绩', new AbortController().signal, async () => true);
    const check = expect(task).rejects.toThrow('timeout'); await vi.advanceTimersByTimeAsync(8000); await check;
    expect(p.kill).toHaveBeenCalledOnce();
  });
  it('does not send after validation finds a stale game', async () => {
    const p = child(); const write = vi.spyOn(p.stdin, 'end');
    const task = typeWithWindowsHelper('战绩', new AbortController().signal, async () => false);
    const check = expect(task).rejects.toThrow('stale game'); p.stdout.write('READY\n'); await check;
    expect(write).not.toHaveBeenCalled(); expect(p.kill).toHaveBeenCalledOnce();
  });
});

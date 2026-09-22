import { describe, it, expect, vi } from 'vitest';
import { createFixtureLiveMatch } from '../fixtures/live-match';
import { GameInputController, inputText } from './controller';

function setup() {
  let now = 1000;
  const match = { ...createFixtureLiveMatch('all'), gameId: '123' };
  const identity = vi.fn(async () => ({ gameId: match.gameId, phase: 'InProgress', connected: true }));
  const type = vi.fn(async (_text: string, _signal: AbortSignal, validate: () => Promise<boolean>) => { expect(await validate()).toBe(true); });
  const notify = vi.fn();
  const controller = new GameInputController({ identity, type, notify, now: () => now });
  return { controller, match, identity, type, notify, advance: () => { now += 4000; } };
}
describe('game input', () => {
  it('cleans controls, rejects commands, bounds UTF16 without splitting emoji', () => {
    expect(inputText('/all hello')).toBe('');
    expect(inputText('abc\n\r\t\u202Edef')).toBe('abc def');
    const text = inputText('😀'.repeat(100));
    expect(text.length).toBeLessThanOrEqual(180);
    expect(text.endsWith('…')).toBe(true);
    expect(text.slice(0, -1)).toBe('😀'.repeat(89));
  });
  it('defaults off; uses only loaded summary and rechecks identity before typing', async () => {
    const s = setup(); s.controller.observe(s.match); await s.controller.trigger();
    expect(s.type).not.toHaveBeenCalled();
    s.controller.setEnabled(true); await s.controller.trigger();
    expect(s.type).not.toHaveBeenCalled();
    s.advance(); s.controller.observe(s.match); await s.controller.trigger();
    expect(s.type).toHaveBeenCalledTimes(1); expect(s.identity).toHaveBeenCalledTimes(2);
    expect(s.type.mock.calls[0][0]).not.toContain('\n');
  });
  it.each(['EndOfGame', 'ChampSelect', 'None'])('does not type during %s', async phase => {
    const s = setup(); s.controller.setEnabled(true); s.controller.observe(s.match);
    s.identity.mockResolvedValue({ gameId: s.match.gameId, phase, connected: true });
    await s.controller.trigger(); expect(s.type).not.toHaveBeenCalled();
  });
  it('rejects another game or disconnected client', async () => {
    const s = setup(); s.controller.setEnabled(true); s.controller.observe(s.match);
    s.identity.mockResolvedValue({ gameId: 'another', phase: 'InProgress', connected: true });
    await s.controller.trigger(); expect(s.type).not.toHaveBeenCalled();
    s.advance(); s.identity.mockResolvedValue({ gameId: s.match.gameId, phase: 'InProgress', connected: false });
    await s.controller.trigger(); expect(s.type).not.toHaveBeenCalled();
  });
  it('suppresses concurrent and repeated hotkeys and aborts on disable', async () => {
    const s = setup(); s.controller.setEnabled(true); s.controller.observe(s.match);
    let finish!: () => void;
    s.type.mockImplementation(async () => new Promise<void>(resolve => { finish = resolve; }));
    const pending = s.controller.trigger(); await vi.waitFor(() => expect(s.type).toHaveBeenCalledTimes(1));
    s.advance(); await s.controller.trigger(); expect(s.type).toHaveBeenCalledTimes(1);
    s.controller.setEnabled(false); expect(s.type.mock.calls[0][1].aborted).toBe(true);
    finish(); await pending;
    s.controller.setEnabled(true); s.advance(); await s.controller.trigger();
    expect(s.type).toHaveBeenCalledTimes(1); // Disabled state discarded the cached summary.
  });
  it('rechecks after helper startup and contains helper failures', async () => {
    const s = setup(); s.controller.setEnabled(true); s.controller.observe(s.match);
    s.type.mockImplementation(async (_text, _signal, validate) => {
      s.identity.mockResolvedValue({ gameId: 'next', phase: 'InProgress', connected: true });
      expect(await validate()).toBe(false); throw new Error('stale');
    });
    await expect(s.controller.trigger()).resolves.toBeUndefined(); expect(s.notify).toHaveBeenCalledTimes(1);
    await s.controller.trigger(); expect(s.type).toHaveBeenCalledTimes(1);
  });
});

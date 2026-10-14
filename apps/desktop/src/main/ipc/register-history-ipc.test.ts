import { describe, expect, it, vi } from 'vitest';

const { handle, getAllWindows, readText } = vi.hoisted(() => ({ handle: vi.fn(), getAllWindows: vi.fn(), readText: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle }, BrowserWindow: { getAllWindows }, clipboard: { readText } }));

import { PERSONAL_HISTORY_GET_CHANNEL, PERSONAL_MATCH_DETAIL_CHANNEL, PERSONAL_MATCH_DETAIL_CANCEL_CHANNEL } from '../../shared/ipc';
import { createFixturePersonalHistory } from '../fixtures/live-match';
import { registerHistoryIpc } from './register-history-ipc';
import { PLAYER_SEARCH, PLAYER_SEARCH_CLIPBOARD } from '../../shared/player-search';

describe('registerHistoryIpc', () => {
  it('only allows the renderer, cancels replaced details and ignores stale cancellation IDs', async () => {
    handle.mockClear();
    const sender = { id: 1 };
    getAllWindows.mockReturnValue([{ webContents: sender, isDestroyed: () => false }]);
    const signals: AbortSignal[] = [];
    const loadDetail = vi.fn((_id: string, _target: unknown, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<never>((_resolve, reject) => signal.addEventListener('abort', () => reject({ code: 'MATCH_CANCELLED' })));
    });
    registerHistoryIpc({ load: vi.fn(), loadDetail });
    const load = handle.mock.calls.find(([channel]) => channel === PERSONAL_MATCH_DETAIL_CHANNEL)![1];
    const cancel = handle.mock.calls.find(([channel]) => channel === PERSONAL_MATCH_DETAIL_CANCEL_CHANNEL)![1];
    const request = { matchId: '1', target: { playerId: '7' }, requestId: 1 };
    await expect(load({ sender: {} }, request)).rejects.toThrow('Unauthorized');
    await expect(load({ sender }, { ...request, matchId: '../bad' })).rejects.toThrow();
    const first = load({ sender }, request);
    const second = load({ sender }, { ...request, requestId: 2 });
    await expect(first).resolves.toBeNull();
    expect(signals[0].aborted).toBe(true);
    cancel({ sender }, 1); expect(signals[1].aborted).toBe(false);
    cancel({ sender }, 2); await expect(second).resolves.toBeNull();
    handle.mockClear();
  });
  it('returns only recognizable player IDs and never reads for unauthorized senders', () => {
    handle.mockClear(); readText.mockClear();
    const sender = {};
    getAllWindows.mockReturnValue([{ webContents: sender, isDestroyed: () => false }]);
    registerHistoryIpc({ load: vi.fn() });
    const handler = handle.mock.calls.find(([channel]) => channel === PLAYER_SEARCH_CLIPBOARD)![1];
    expect(() => handler({ sender: {} })).toThrow('Unauthorized');
    expect(readText).not.toHaveBeenCalled();
    readText.mockReturnValue(' 测试玩家#12345 ');
    expect(handler({ sender })).toBe('测试玩家#12345');
    for (const value of ['普通内容', 'https://example.com/#12345', '你好\n玩家#12345', '玩家#12345\n其他内容', '玩家#12345#678']) {
      readText.mockReturnValue(value); expect(handler({ sender })).toBeUndefined();
    }
    readText.mockImplementationOnce(() => { throw new Error('unavailable'); });
    expect(handler({ sender })).toBeUndefined();
    handle.mockClear();
  });
  it('authorizes and validates searches and rejects overlapping requests', async () => {
    handle.mockClear();
    const sender = {};
    getAllWindows.mockReturnValue([{ webContents: sender, isDestroyed: () => false }]);
    let finish!: (value: { ok: false; error: 'not-found' }) => void;
    const search = vi.fn(() => new Promise<{ ok: false; error: 'not-found' }>(resolve => { finish = resolve; }));
    registerHistoryIpc({ load: vi.fn(), search });
    const handler = handle.mock.calls.find(([channel]) => channel === PLAYER_SEARCH)![1];
    await expect(handler({ sender: {} }, '测试#123')).rejects.toThrow('Unauthorized');
    await expect(handler({ sender }, '测试')).rejects.toThrow();
    const pending = handler({ sender }, '测试#123');
    await expect(handler({ sender }, '测试#123')).resolves.toEqual({ ok: false, error: 'busy' });
    expect(search).toHaveBeenCalledTimes(1);
    finish({ ok: false, error: 'not-found' });
    await expect(pending).resolves.toEqual({ ok: false, error: 'not-found' });
    handle.mockClear();
  });
  it('authorizes the sender, validates an optional player target, and validates the response', async () => {
    const snapshot = createFixturePersonalHistory();
    const load = vi.fn().mockResolvedValue(snapshot);
    const sender = {};
    getAllWindows.mockReturnValue([{ webContents: sender, isDestroyed: () => false }]);
    registerHistoryIpc({ load });
    const handler = handle.mock.calls.find(([channel]) => channel === PERSONAL_HISTORY_GET_CHANNEL)?.[1];

    await expect(handler({ sender }, undefined)).resolves.toEqual(snapshot);
    const target = { playerId: 'target', puuid: 'target-puuid', displayName: '目标玩家' };
    await expect(handler({ sender }, target)).resolves.toEqual(snapshot);
    expect(load).toHaveBeenLastCalledWith(target);
    await handler({ sender }, target, true);
    expect(load).toHaveBeenLastCalledWith(target, true);
    await expect(handler({ sender }, target, 'yes')).rejects.toThrow();
    await expect(handler({ sender }, { unexpected: true })).rejects.toThrow();
    await expect(handler({ sender: {} }, undefined)).rejects.toThrow('Unauthorized IPC sender');

    load.mockResolvedValue({ ...snapshot, unexpected: true });
    await expect(handler({ sender }, undefined)).rejects.toThrow();
  });
});

import { describe, expect, it, vi } from 'vitest';

const { handle, getAllWindows } = vi.hoisted(() => ({ handle: vi.fn(), getAllWindows: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle }, BrowserWindow: { getAllWindows } }));

import { PERSONAL_HISTORY_GET_CHANNEL } from '../../shared/ipc';
import { createFixturePersonalHistory } from '../fixtures/live-match';
import { registerHistoryIpc } from './register-history-ipc';
import { PLAYER_SEARCH } from '../../shared/player-search';

describe('registerHistoryIpc', () => {
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
    await expect(handler({ sender }, { unexpected: true })).rejects.toThrow();
    await expect(handler({ sender: {} }, undefined)).rejects.toThrow('Unauthorized IPC sender');

    load.mockResolvedValue({ ...snapshot, unexpected: true });
    await expect(handler({ sender }, undefined)).rejects.toThrow();
  });
});

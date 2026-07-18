import { describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({ handle: vi.fn(), getAllWindows: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: electron.handle }, BrowserWindow: { getAllWindows: electron.getAllWindows } }));

import { CHAMPION_GUIDE_GET_CHANNEL } from '../../shared/ipc';
import { registerChampionIpc } from './register-champion-ipc';

const guide = { championId: 114, lane: 'TOP' as const, patch: '16.14', source: 'OPGG' as const, region: 'KR', tier: 'EMERALD+', fetchedAt: '2026-07-16T00:00:00.000Z', builds: [], favorable: [], unfavorable: [], notes: [], stale: false };

describe('registerChampionIpc', () => {
  it('authorizes the sender and strictly validates input and output', async () => {
    const sender = {}; const service = { getChampionGuide: vi.fn().mockResolvedValue(guide) };
    electron.getAllWindows.mockReturnValue([{ webContents: sender, isDestroyed: () => false }]);
    registerChampionIpc(service);
    const handler = electron.handle.mock.calls.find(([channel]) => channel === CHAMPION_GUIDE_GET_CHANNEL)?.[1];
    await expect(handler({ sender: {} }, { championId: 114, lane: 'TOP' })).rejects.toThrow('Unauthorized');
    await expect(handler({ sender }, { championId: 114, lane: 'TOP', extra: true })).rejects.toThrow();
    await expect(handler({ sender }, { championId: 114, lane: 'TOP' })).resolves.toEqual(guide);
    service.getChampionGuide.mockResolvedValueOnce({ ...guide, unexpected: true });
    await expect(handler({ sender }, { championId: 114, lane: 'TOP' })).rejects.toThrow();
  });
});

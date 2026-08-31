import { beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({ handle: vi.fn(), getAllWindows: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: { handle: electron.handle }, BrowserWindow: { getAllWindows: electron.getAllWindows } }));

import { CHAMPION_CATALOG_GET_CHANNEL, CHAMPION_DETAILS_GET_CHANNEL, CHAMPION_GUIDE_GET_CHANNEL } from '../../shared/ipc';
import { registerChampionIpc } from './register-champion-ipc';

const guide = { championId: 114, lane: 'TOP' as const, patch: '16.14', source: 'OPGG' as const, region: 'KR', tier: 'EMERALD+', fetchedAt: '2026-07-16T00:00:00.000Z', builds: [], favorable: [], unfavorable: [], notes: [], stale: false };

describe('registerChampionIpc', () => {
  beforeEach(() => vi.clearAllMocks());
  it('authorizes the sender and strictly validates input and output', async () => {
    const sender = {}; const service = { getChampionGuide: vi.fn().mockResolvedValue(guide), getCatalog: vi.fn(), getDetails: vi.fn() };
    electron.getAllWindows.mockReturnValue([{ webContents: sender, isDestroyed: () => false }]);
    registerChampionIpc(service);
    const handler = electron.handle.mock.calls.find(([channel]) => channel === CHAMPION_GUIDE_GET_CHANNEL)?.[1];
    await expect(handler({ sender: {} }, { championId: 114, lane: 'TOP' })).rejects.toThrow('Unauthorized');
    await expect(handler({ sender }, { championId: 114, lane: 'TOP', extra: true })).rejects.toThrow();
    await expect(handler({ sender }, { championId: 114, lane: 'TOP' })).resolves.toEqual(guide);
    service.getChampionGuide.mockResolvedValueOnce({ ...guide, unexpected: true } as never);
    await expect(handler({ sender }, { championId: 114, lane: 'TOP' })).rejects.toThrow();
  });

  it('exposes validated catalog and selected champion details', async () => {
    const sender = {};
    const catalog = [{ id: 145, name: '虚空之女', title: '卡莎', alias: 'Kaisa', roles: ['marksman'] }];
    const details = { ...catalog[0], shortBio: '虚空猎手', abilities: [
      { key: 'P', name: '体表活肤', description: '', iconPath: '/p.png' },
      { key: 'Q', name: '艾卡西亚暴雨', description: '', iconPath: '/q.png' },
      { key: 'W', name: '虚空索敌', description: '', iconPath: '/w.png' },
      { key: 'E', name: '极限超载', description: '', iconPath: '/e.png' },
      { key: 'R', name: '猎手本能', description: '', iconPath: '/r.png' }
    ] };
    const service = { getChampionGuide: vi.fn().mockResolvedValue(guide), getCatalog: vi.fn().mockResolvedValue(catalog), getDetails: vi.fn().mockResolvedValue(details) };
    electron.getAllWindows.mockReturnValue([{ webContents: sender, isDestroyed: () => false }]);
    registerChampionIpc(service);
    const catalogHandler = electron.handle.mock.calls.find(([channel]) => channel === CHAMPION_CATALOG_GET_CHANNEL)?.[1];
    const detailsHandler = electron.handle.mock.calls.find(([channel]) => channel === CHAMPION_DETAILS_GET_CHANNEL)?.[1];
    await expect(catalogHandler({ sender })).resolves.toEqual(catalog);
    await expect(detailsHandler({ sender }, { championId: 145 })).resolves.toEqual(details);
    await expect(detailsHandler({ sender }, { championId: 0 })).rejects.toThrow();
  });
});
import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('a failed phase poll cannot cancel a healthy slow live-history load', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lol-availability-'));
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match', `--user-data-dir=${directory}`], env: { ...process.env, PLAYWRIGHT_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    const match = await page.evaluate(() => window.lolViewer!.getLiveMatch('all'));
    await app.evaluate(({ ipcMain }, match) => {
      const state = globalThis as any;
      state.historyMatch = match; state.historyLoads = 0; state.historyCancels = 0; state.phaseChecks = 0;
      ipcMain.removeHandler('match:get-live');
      ipcMain.handle('match:get-live', () => { state.historyLoads++; return new Promise(resolve => { state.finishHistoryLoad = resolve; }); });
      ipcMain.removeHandler('match:cancel'); ipcMain.handle('match:cancel', () => { state.historyCancels++; });
      ipcMain.removeHandler('gameflow:get-session-identity');
      ipcMain.handle('gameflow:get-session-identity', () => {
        state.phaseChecks++;
        if (state.phaseChecks === 2) throw new Error('Live data unavailable [DIAG:D-012345ABCDEF:TIMEOUT]');
        return { phase: state.phaseChecks > 2 ? 'InProgress' : 'ChampSelect', gameId: match.gameId };
      });
    }, match);
    await page.getByRole('tab', { name: '对战信息', exact: true }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as any).phaseChecks), { timeout: 9000 }).toBeGreaterThanOrEqual(2);
    expect(await app.evaluate(() => ({ loads: (globalThis as any).historyLoads, cancels: (globalThis as any).historyCancels }))).toEqual({ loads: 1, cancels: 0 });
    await app.evaluate(() => (globalThis as any).finishHistoryLoad((globalThis as any).historyMatch));
    await expect(page.getByTestId('player-card')).toHaveCount(10);
    await expect(page.getByTestId('recent-match')).toHaveCount(100);
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});

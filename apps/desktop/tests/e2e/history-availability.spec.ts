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

test('personal list refresh stays usable while selected details are slow or fail', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lol-personal-availability-'));
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match', `--user-data-dir=${directory}`], env: { ...process.env, PLAYWRIGHT_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1320, height: 900 });
    const snapshot = await page.evaluate(() => window.lolViewer!.getPersonalHistory());
    await app.evaluate(({ ipcMain }, snapshot) => {
      const state = globalThis as any;
      state.detailBase = snapshot; state.detailCalls = []; state.detailPending = {}; state.detailMode = 'pending'; state.listCalls = 0;
      ipcMain.removeHandler('gameflow:get-session-identity');
      ipcMain.handle('gameflow:get-session-identity', () => ({ phase: 'None', connected: false }));
      ipcMain.removeHandler('history:get-personal');
      ipcMain.handle('history:get-personal', () => {
        state.listCalls++;
        return { ...snapshot, updatedAt: snapshot.updatedAt + state.listCalls,
          matches: snapshot.matches.map(match => {
            const partial = { ...match };
            delete partial.allyPlayers; delete partial.enemyPlayers; delete partial.allyChampionIds; delete partial.enemyChampionIds;
            return partial;
          }) };
      });
      ipcMain.removeHandler('history:get-detail');
      ipcMain.handle('history:get-detail', (_event, request) => {
        state.detailCalls.push(request.matchId);
        if (state.detailMode === 'error') throw new Error('Personal history is unavailable [HISTORY:TIMEOUT] [DIAG:D-012345ABCDEF:TIMEOUT]');
        const detail = { match: snapshot.matches.find(m => m.matchId === request.matchId), itemIconPaths: snapshot.itemIconPaths ?? {} };
        if (state.detailMode === 'ready') return detail;
        return new Promise(resolve => { state.detailPending[request.matchId] = () => resolve(detail); });
      });
    }, snapshot);
    await page.reload();
    await expect(page.getByTestId('personal-match')).toHaveCount(10);
    await expect(page.getByText('正在加载对局详情…')).toBeVisible();
    await expect.poll(() => app.evaluate(() => (globalThis as any).detailCalls.length)).toBe(1);
    await page.getByTestId('personal-match').nth(2).click();
    await expect.poll(() => app.evaluate(() => (globalThis as any).detailCalls.length)).toBe(2);
    await app.evaluate(() => (globalThis as any).detailPending['fixture-personal-2']());
    await expect(page.getByLabel('己方详情').getByRole('row')).toHaveCount(6);
    await expect(page.getByText('对局 ID · fixture-personal-2')).toBeVisible();
    await app.evaluate(() => (globalThis as any).detailPending['fixture-personal-0']());
    await expect(page.getByText('对局 ID · fixture-personal-2')).toBeVisible();
    await app.evaluate(() => { (globalThis as any).detailMode = 'error'; });
    await page.getByTestId('personal-match').nth(3).click();
    await expect(page.getByRole('alert')).toContainText('请求超时');
    await expect(page.getByRole('alert')).toContainText('D-012345ABCDEF');
    await expect(page.getByTestId('personal-match')).toHaveCount(10);
    await page.screenshot({ path: '/private/tmp/lol-history-detail-error.png' });
    await app.evaluate(() => { (globalThis as any).detailMode = 'ready'; });
    await page.getByRole('button', { name: '重试详情' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel('敌方详情').getByRole('row')).toHaveCount(6);
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as any).listCalls)).toBe(2);
    await expect(page.getByTestId('personal-match')).toHaveCount(10);
    await expect(page.getByText('对局 ID · fixture-personal-0')).toBeVisible();
    await expect(page.getByLabel('己方详情').getByRole('row')).toHaveCount(6);
    expect(await app.evaluate(() => (globalThis as any).detailCalls.length)).toBe(5);
    await page.screenshot({ path: '/private/tmp/lol-history-availability.png' });
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});

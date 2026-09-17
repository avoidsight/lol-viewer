import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
test('important update button is passive, offers notes, download, cancel and per-version ignore', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lol-updates-'));
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match', `--user-data-dir=${dir}`], env: { ...process.env, PLAYWRIGHT_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('button', { name: '新版本' })).toHaveCount(0);
    await app.evaluate(({ ipcMain }) => {
      (globalThis as any).updateVersion = '1.1.0'; (globalThis as any).downloads = [];
      ipcMain.removeHandler('updates:check'); ipcMain.removeHandler('updates:open');
      ipcMain.handle('updates:check', () => ({ version: (globalThis as any).updateVersion, notes: '优化对战总览标签展示\n新增 MVP / SVP 综合表现评级\n修复部分情况下的战绩加载问题' }));
      ipcMain.handle('updates:open', (_event, version) => { (globalThis as any).downloads.push(version); return true; });
    });
    await page.reload(); await page.setViewportSize({ width: 1184, height: 735 });
    const trigger = page.getByRole('button', { name: '新版本' });
    await expect(trigger).toBeVisible(); await expect(page.getByRole('dialog')).not.toBeVisible();
    await trigger.click(); const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('重要更新')).toBeVisible();
    await page.screenshot({ path: '/private/tmp/lol-update-dialog.png' });
    await dialog.getByRole('button', { name: '取消', exact: true }).click(); await expect(trigger).toBeFocused();
    await trigger.click(); await dialog.getByRole('button', { name: '更新', exact: true }).click();
    expect(await app.evaluate(() => (globalThis as any).downloads)).toEqual(['1.1.0']);
    await trigger.click(); await dialog.getByRole('button', { name: '该版本不再提示' }).click();
    await page.reload(); await expect(trigger).toHaveCount(0);
    await app.evaluate(() => { (globalThis as any).updateVersion = '1.2.0'; });
    await page.reload(); await expect(trigger).toBeVisible();
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

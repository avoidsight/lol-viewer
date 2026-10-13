import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
test('in-app updates show progress, cancel/retry, defer installation and never open a browser', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lol-updates-'));
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match', `--user-data-dir=${dir}`], env: { ...process.env, PLAYWRIGHT_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    const version = await app.evaluate(({ app }) => app.getVersion());
    await page.getByRole('tab', { name: '设置', exact: true }).click();
    await expect(page.locator('.settings-page__version')).toHaveText(`峡谷雷达 v${version}`);
    await page.screenshot({ path: '/private/tmp/lol-settings-version.png' });
    await page.getByRole('tab', { name: '战绩', exact: true }).click();
    await expect(page.getByRole('button', { name: '新版本' })).toHaveCount(0);
    await app.evaluate(({ ipcMain, BrowserWindow, shell }) => {
      const state = globalThis as any;
      state.updateVersion = '1.1.0'; state.downloads = []; state.installs = []; state.external = [];
      shell.openExternal = async url => { state.external.push(url); };
      state.updateDownload = { phase: 'idle', receivedBytes: 0, totalBytes: 0 };
      state.sendUpdate = (value: unknown) => {
        state.updateDownload = value;
        BrowserWindow.getAllWindows()[0].webContents.send('updates:state', value);
      };
      for (const channel of ['check', 'status', 'download', 'cancel', 'install']) ipcMain.removeHandler(`updates:${channel}`);
      ipcMain.handle('updates:check', () => ({ version: state.updateVersion, important: true, notes: '支持在应用内下载安装包\n优化战绩加载与兼容性\n修复部分情况下的阵容显示问题' }));
      ipcMain.handle('updates:status', () => state.updateDownload);
      ipcMain.handle('updates:download', (_event, version) => {
        state.downloads.push(version);
        state.sendUpdate({ phase: 'downloading', version, receivedBytes: 43369104, totalBytes: 92274688 });
        return new Promise(resolve => { state.finishDownload = resolve; });
      });
      ipcMain.handle('updates:cancel', () => {
        state.sendUpdate({ phase: 'idle', receivedBytes: 0, totalBytes: 0 });
        state.finishDownload(state.updateDownload); return state.updateDownload;
      });
      ipcMain.handle('updates:install', (_event, version) => {
        state.installs.push(version); state.sendUpdate({ ...state.updateDownload, phase: 'installing' }); return state.updateDownload;
      });
    });
    await page.reload(); await page.setViewportSize({ width: 1184, height: 735 });
    const trigger = page.getByRole('button', { name: '新版本' });
    await expect(trigger.locator('svg path')).toHaveAttribute('d', 'M12 4v12m-5-5 5 5 5-5M5 17v3h14v-3');
    await expect(trigger).toBeVisible(); await expect(page.getByRole('dialog')).not.toBeVisible();
    await trigger.click(); const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('重要更新')).toBeVisible();
    await dialog.getByRole('button', { name: '取消', exact: true }).click(); await expect(trigger).toBeFocused();
    await trigger.click(); await dialog.getByRole('button', { name: '下载更新', exact: true }).click();
    await expect(dialog.getByRole('progressbar')).toHaveAttribute('value', '47');
    await page.screenshot({ path: '/private/tmp/lol-update-download.png' });
    await dialog.getByRole('button', { name: '后台下载' }).click();
    await expect(dialog).not.toBeVisible(); await trigger.click();
    await expect(dialog.getByRole('progressbar')).toHaveAttribute('value', '47');
    expect(await app.evaluate(() => (globalThis as any).downloads)).toEqual(['1.1.0']);
    await dialog.getByRole('button', { name: '取消下载' }).click();
    await dialog.getByRole('button', { name: '下载更新' }).click();
    await app.evaluate(() => {
      const state = globalThis as any;
      state.sendUpdate({ ...state.updateDownload, phase: 'ready', receivedBytes: state.updateDownload.totalBytes });
      state.finishDownload(state.updateDownload);
    });
    await expect(dialog.getByRole('button', { name: '退出并安装' })).toBeEnabled();
    expect(await app.evaluate(() => (globalThis as any).installs)).toEqual([]);
    await page.screenshot({ path: '/private/tmp/lol-update-ready.png' });
    await dialog.getByRole('button', { name: '稍后安装' }).click(); await trigger.click();
    await dialog.getByRole('button', { name: '退出并安装' }).click();
    expect(await app.evaluate(() => (globalThis as any).installs)).toEqual(['1.1.0']);
    expect(await app.evaluate(() => (globalThis as any).external)).toEqual([]);
    await app.evaluate(() => (globalThis as any).sendUpdate({ phase: 'idle', receivedBytes: 0, totalBytes: 0 }));
    await dialog.getByRole('button', { name: '该版本不再提示' }).click();
    await page.reload(); await expect(trigger).toBeVisible(); await expect(dialog).not.toBeVisible();
    await app.evaluate(({ ipcMain }) => {
      (globalThis as any).updateVersion = '1.2.0';
      ipcMain.removeHandler('gameflow:get-session-identity');
      ipcMain.handle('gameflow:get-session-identity', () => ({ phase: 'None', connected: false }));
    });
    await page.reload(); await page.bringToFront(); await expect(trigger).toBeVisible();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(dialog).not.toBeVisible(); await expect(trigger).toBeVisible();
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

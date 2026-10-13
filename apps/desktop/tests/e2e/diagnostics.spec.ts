import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('exports real bounded local logs and shows safe live diagnostic feedback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lol-diagnostics-e2e-'));
  const exportPath = join(directory, 'diagnostic-export.txt');
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match', `--user-data-dir=${directory}`], env: { ...process.env, PLAYWRIGHT_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1184, height: 800 });
    await app.evaluate(({ dialog }, path) => {
      let cancelled = true;
      dialog.showSaveDialog = (async () => {
        if (cancelled) { cancelled = false; return { canceled: true }; }
        return { canceled: false, filePath: path };
      }) as typeof dialog.showSaveDialog;
    }, exportPath);
    await page.getByRole('tab', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '导出日志' }).click();
    await expect(page.getByRole('button', { name: '导出日志' })).toBeEnabled();
    await expect(page.getByText(/诊断日志已保存/)).toHaveCount(0);
    await page.getByRole('button', { name: '导出日志' }).click();
    await expect(page.getByRole('status')).toHaveText('诊断日志已保存，可将文件发给开发者排查。');
    const content = await readFile(exportPath, 'utf8');
    expect(Buffer.byteLength(content)).toBeLessThan(3 * 1024 * 1024 + 1024);
    const rows = content.trim().split('\n').map(line => JSON.parse(line));
    expect(rows[0]).toMatchObject({ version: await app.evaluate(({ app }) => app.getVersion()), arch: expect.any(String), platform: expect.any(String) });
    expect(rows).toContainEqual(expect.objectContaining({ operation: 'startup' }));
    for (const field of ['displayName', 'puuid', 'Authorization', 'accessToken', 'stack']) expect(content).not.toContain(field);
    await page.screenshot({ path: '/private/tmp/lol-diagnostics-settings.png' });
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('gameflow:get-session-identity');
      ipcMain.handle('gameflow:get-session-identity', () => ({ phase: 'ChampSelect', gameId: 'diagnostics-fixture' }));
      ipcMain.removeHandler('match:get-live');
      ipcMain.handle('match:get-live', () => { throw new Error('Live data unavailable [DIAG:D-012345ABCDEF:SCHEMA]'); });
    });
    await page.getByRole('tab', { name: '对战信息', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('数据格式不兼容');
    await expect(page.getByRole('alert')).toContainText('D-012345ABCDEF');
    await page.screenshot({ path: '/private/tmp/lol-diagnostics-live-error.png' });
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});

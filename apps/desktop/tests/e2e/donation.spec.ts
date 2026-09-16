import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

test('support is opt-in, modal restores focus, and disabled config hides entry', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'lol-donation-'));
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match', `--user-data-dir=${userData}`], env: { ...process.env, PLAYWRIGHT_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1184, height: 735 });
    // Synthetic preview uses the app icon, never a real payment QR or production API.
    const image = `data:image/png;base64,${(await readFile(join(process.cwd(), 'resources/icon.png'))).toString('base64')}`;
    await app.evaluate(({ ipcMain }, image) => {
      ipcMain.removeHandler('donation:config'); ipcMain.removeHandler('donation:image');
      ipcMain.handle('donation:config', () => ({ enabled: true, revision: 1 }));
      ipcMain.handle('donation:image', () => image);
    }, image);
    await page.reload();
    const trigger = page.getByRole('button', { name: '支持作者' });
    await expect(trigger).toBeVisible();
    await expect(page.getByRole('dialog', { name: '谢谢你的支持' })).not.toBeVisible();
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '谢谢你的支持' });
    await expect(dialog.getByAltText('微信赞赏码')).toBeVisible();
    await page.screenshot({ path: '/private/tmp/lol-donation-preview.png' });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('donation:config'); ipcMain.removeHandler('donation:image');
      ipcMain.handle('donation:config', () => ({ enabled: false, revision: 2 }));
      ipcMain.handle('donation:image', () => null);
    });
    await trigger.click();
    await expect(dialog.getByText('赞赏暂不可用，请关闭后重试。')).toBeVisible();
    await expect(dialog.getByAltText('微信赞赏码')).toHaveCount(0);
    await page.reload();
    await expect(trigger).toHaveCount(0);
  } finally { await app.close(); await rm(userData, { recursive: true, force: true }); }
});

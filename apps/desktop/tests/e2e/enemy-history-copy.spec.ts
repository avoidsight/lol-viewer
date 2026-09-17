import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

test('enemy summary opt-in persists and copy notice is passive; fixture never writes clipboard', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lol-copy-settings-'));
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match', `--user-data-dir=${dir}`], env: { ...process.env, PLAYWRIGHT_TEST: '1' } });
  try {
    // Stub writer so this test never reads or overwrites the host clipboard.
    await app.evaluate(({ clipboard }) => {
      (globalThis as any).testClipboardWrites = 0;
      clipboard.writeText = () => { (globalThis as any).testClipboardWrites++; };
    });
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1184, height: 735 });
    await page.getByRole('tab', { name: '设置' }).click();
    const toggle = page.getByRole('switch', { name: /自动复制敌方战绩/ });
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(page.getByText('自动复制已开启')).toBeVisible();
    await page.reload();
    await page.getByRole('tab', { name: '设置' }).click();
    await expect(toggle).toBeChecked();
    await page.screenshot({ path: '/private/tmp/lol-auto-copy-settings.png' });
    await page.getByRole('tab', { name: '对战信息' }).click();
    await expect(page.getByTestId('player-card')).toHaveCount(10);
    expect(await app.evaluate(() => (globalThis as any).testClipboardWrites)).toBe(0);
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.send('match:enemy-history-copied'); });
    await expect(page.getByRole('status').filter({ hasText: '敌方战绩已复制' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '对战信息' })).toBeFocused();
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

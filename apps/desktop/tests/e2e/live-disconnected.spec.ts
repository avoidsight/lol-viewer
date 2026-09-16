import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

test('no League client shows a stable empty state instead of infinite roster loading', async () => {
  // Non-Windows discovery returns no LCU. Never depend on a real Windows session.
  test.skip(process.platform === 'win32', 'Requires an isolated no-LCU host');
  const dir = await mkdtemp(join(tmpdir(), 'lol-disconnected-'));
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js'), `--user-data-dir=${dir}`], env: { ...process.env, PLAYWRIGHT_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await page.getByRole('tab', { name: '对战信息' }).click();
    await expect(page.getByText('未连接英雄联盟客户端', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.live-match-page__progress')).toHaveCount(0);
    await expect(page.getByRole('group', { name: '显示方式' })).toHaveCount(0);
    await expect(page.getByTestId('player-card')).toHaveCount(0);
    await page.screenshot({ path: '/private/tmp/lol-live-disconnected.png' });
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

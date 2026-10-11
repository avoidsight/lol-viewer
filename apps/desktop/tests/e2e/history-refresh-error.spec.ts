import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('failed refresh shows a safe toast and preserves the loaded history', async () => {
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match'], env: { ...process.env, PLAYWRIGHT_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId('personal-match')).toHaveCount(10);
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('history:get-personal');
      ipcMain.handle('history:get-personal', () => { throw new Error('Personal history is unavailable [HISTORY:SCHEMA]'); });
    });
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('刷新失败：战绩数据格式不兼容，解析失败×');
    await expect(page.getByTestId('personal-match')).toHaveCount(10);
    await page.screenshot({ path: '/private/tmp/lol-history-refresh-toast.png' });
    await page.getByRole('button', { name: '关闭刷新错误提示' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 10000 });
  } finally { await app.close(); }
});

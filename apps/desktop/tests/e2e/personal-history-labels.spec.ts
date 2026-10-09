import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('history master detail paginates, selects and opens players', async () => {
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match'], env: { ...process.env, PLAYWRIGHT_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1320, height: 980 });
    const rows = page.getByTestId('personal-match');
    const detail = page.getByLabel('选中对局详情', { exact: true });
    await expect(rows).toHaveCount(10);
    await expect(detail.getByTestId('history-highlight')).toHaveText(['超神', '三杀', '最高输出']);
    await rows.nth(2).click();
    await expect(detail.getByTestId('history-highlight')).toHaveText(['CARRY', '最高输出', '最高承伤']);
    await expect(detail.getByTestId('match-score')).toBeVisible();
    await expect(detail.getByRole('row')).toHaveCount(12);
    await page.getByRole('button', { name: '下一页' }).click();
    await expect(detail).toContainText('对局 ID · fixture-personal-10');
    await page.getByRole('button', { name: '上一页' }).click();
    for (const width of [1320, 1184, 900]) {
      await page.setViewportSize({ width, height: 980 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const left = await page.getByLabel('战绩列表', { exact: true }).boundingBox();
      const right = await detail.boundingBox();
      expect(left!.x + left!.width).toBeLessThan(right!.x);
    }
    await page.setViewportSize({ width: 1320, height: 980 });
    await page.screenshot({ path: '/private/tmp/lol-history-master-detail.png', fullPage: true });
    await detail.getByRole('button', { name: 'Fixture Enemy 1#192', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Fixture Enemy 1#192', exact: true })).toBeVisible();
  } finally { await app.close(); }
});

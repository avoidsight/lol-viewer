import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

test('search by full player ID opens history and can return', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lol-search-'));
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match', `--user-data-dir=${dir}`], env: { ...process.env, PLAYWRIGHT_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('navigation', { name: '主导航' }).getByText('峡谷雷达')).toHaveCount(0);
    const input = page.getByRole('textbox', { name: '玩家名字和编号' });
    await input.fill('缺少编号');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('请输入完整的名字#编号');
    await input.fill('测试玩家#12345');
    await input.press('Enter');
    await expect(page.getByRole('heading', { name: '测试玩家#12345', exact: true })).toBeVisible();
    const back = page.getByRole('button', { name: '返回我的战绩' });
    await expect(back).toHaveText('我的战绩');
    for (const width of [1184, 900]) {
      await page.setViewportSize({ width, height: 735 });
      const buttonBounds = await back.boundingBox();
      const heroBounds = await page.locator('.personal-history__hero').boundingBox();
      expect(buttonBounds!.y + buttonBounds!.height).toBeLessThan(heroBounds!.y);
      expect(buttonBounds!.height).toBeGreaterThanOrEqual(34);
      const searchBounds = await page.getByRole('button', { name: '搜索', exact: true }).boundingBox();
      expect(Math.abs(buttonBounds!.y + buttonBounds!.height / 2 - searchBounds!.y - searchBounds!.height / 2)).toBeLessThan(1);
      const field = await page.locator('.player-search__field').boundingBox();
      expect(searchBounds!.x + searchBounds!.width).toBeLessThanOrEqual(field!.x + field!.width);
    }
    await page.setViewportSize({ width: 1184, height: 735 });
    await page.screenshot({ path: '/private/tmp/lol-player-search.png' });
    await page.getByRole('button', { name: '返回我的战绩' }).click();
    await expect(page.getByRole('heading', { name: 'Fixture Personal Player', exact: true })).toBeVisible();
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

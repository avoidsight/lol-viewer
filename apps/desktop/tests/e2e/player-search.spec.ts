import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

test('search by full player ID opens history and can return', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lol-search-'));
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match', `--user-data-dir=${dir}`], env: { ...process.env, PLAYWRIGHT_TEST: '1' } });
  try {
    await app.evaluate(({ clipboard }) => { clipboard.readText = () => '测试玩家#12345'; });
    const page = await app.firstWindow();
    await expect(page.getByRole('navigation', { name: '主导航' }).getByText('峡谷雷达')).toHaveCount(0);
    const input = page.getByRole('textbox', { name: '玩家名字和编号' });
    await page.getByRole('tab', { name: '设置' }).click();
    await input.focus();
    await expect(input).toHaveValue('测试玩家#12345');
    await expect(page.getByRole('tab', { name: '设置' })).toHaveAttribute('aria-selected', 'true');
    await input.fill('缺少编号');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('请输入完整的名字#编号');
    await input.fill('测试玩家#12345');
    await input.press('Enter');
    await expect(page.getByRole('heading', { name: '测试玩家#12345', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '返回我的战绩' })).toHaveCount(0);
    for (const width of [1184, 900]) {
      await page.setViewportSize({ width, height: 735 });
      const searchBounds = await page.getByRole('button', { name: '搜索', exact: true }).boundingBox();
      const field = await page.locator('.player-search__field').boundingBox();
      expect(field!.width).toBeLessThanOrEqual(240);
      expect(searchBounds!.x + searchBounds!.width).toBeLessThanOrEqual(field!.x + field!.width);
      const nav = await page.getByRole('navigation').boundingBox();
      expect(field!.y + field!.height).toBeLessThanOrEqual(nav!.y + nav!.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 1184, height: 735 });
    await page.screenshot({ path: '/private/tmp/lol-player-search.png' });
    await page.getByRole('tab', { name: '战绩', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Fixture Personal Player', exact: true })).toBeVisible();
    await expect(input).toHaveValue('');
    for (const mode of ['详细', '总览']) {
      await page.getByRole('tab', { name: '对战信息' }).click();
      await page.getByRole('button', { name: mode, exact: true }).click();
      const playerName = page.locator('.player-card__name-link').nth(mode === '详细' ? 1 : 6);
      const name = await playerName.textContent();
      await playerName.click();
      await expect(page.getByRole('tab', { name: '战绩', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('heading', { name: name!, exact: true })).toBeVisible();
      await page.getByRole('tab', { name: '战绩', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Fixture Personal Player', exact: true })).toBeVisible();
    }
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

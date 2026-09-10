import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('three tabs load personal history first and live comparison on demand', async () => {
  const startedAt = Date.now();
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match'],
    env: { ...process.env, PLAYWRIGHT_TEST: '1' }
  });

  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('tab')).toHaveCount(3);
    await expect(page.getByRole('tab', { name: '战绩' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('personal-match')).toHaveCount(20);
    await expect(page.getByTestId('player-card')).toHaveCount(0);
    await page.getByRole('tab', { name: '对战信息' }).click();
    await expect(page.getByTestId('player-card')).toHaveCount(10);
    await expect(page.getByTestId('recent-match')).toHaveCount(100);
    const modeHeading = page.locator('.live-match-page__mode');
    await expect(modeHeading).toBeVisible();
    await expect(modeHeading).toHaveText('单双排');
    for (const viewport of [{ width: 1184, height: 735 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(viewport);
      const layout = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.player-card')];
        const lists = [...document.querySelectorAll<HTMLElement>('.player-card__matches')];
        return {
          bottom: cards.at(-1)!.getBoundingClientRect().bottom,
          right: cards.at(-1)!.getBoundingClientRect().right,
          pageHeight: document.documentElement.scrollHeight,
          visibleRows: lists.map(list => [...list.children].filter(row => row.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom + 1).length)
        };
      });
      expect(layout.pageHeight).toBeLessThanOrEqual(viewport.height + 1);
      expect(viewport.height - layout.bottom).toBeLessThan(25);
      expect(viewport.width - layout.right).toBeLessThan(25);
      expect(layout.visibleRows.every(count => count >= 5)).toBe(true);
    }
    await page.setViewportSize({ width: 1184, height: 735 });
    const scrollPositions = await page.locator('.player-card__matches').evaluateAll(lists => {
      lists[0].scrollTop = 80;
      return lists.map(list => list.scrollTop);
    });
    expect(scrollPositions[0]).toBeGreaterThan(0);
    expect(scrollPositions.slice(1).every(top => top === 0)).toBe(true);
    await page.getByRole('tab', { name: '设置' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
    expect(Date.now() - startedAt).toBeLessThan(15_000);
  } finally {
    await app.close();
  }
});

test('ARAM fixture preserves each client roster order', async () => {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js'), '--fixture-aram'],
    env: { ...process.env, PLAYWRIGHT_TEST: '1' }
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('tab', { name: '对战信息' }).click();
    await expect(page.locator('.live-match-page__mode')).toHaveText('极地大乱斗');
    const teams = page.locator('.team-row');
    await expect(teams).toHaveCount(2);
    await expect(teams.nth(0).locator('.player-card__header h3')).toHaveText([
      'ARAM Ally Zoe', 'ARAM Ally Garen', 'ARAM Ally Lux', 'ARAM Ally Ashe', 'ARAM Ally Braum'
    ]);
    await expect(teams.nth(1).locator('.player-card__header h3')).toHaveText([
      'ARAM Enemy Jinx', 'ARAM Enemy Darius', 'ARAM Enemy Ahri', 'ARAM Enemy Lee', 'ARAM Enemy Lulu'
    ]);
  } finally {
    await app.close();
  }
});

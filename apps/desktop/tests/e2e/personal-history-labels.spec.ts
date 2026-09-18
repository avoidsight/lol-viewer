import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('personal history uses readable bounded honors and ID-only player tooltips', async () => {
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match'], env: { ...process.env, PLAYWRIGHT_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1184, height: 735 });
    const rows = page.getByTestId('personal-match');
    await expect(rows).toHaveCount(20);
    await expect(rows.first().getByTestId('history-highlight')).toHaveText(['超神', '三杀', '最高输出']);
    await expect(rows.nth(2).getByTestId('history-highlight')).toHaveText(['CARRY', '最高输出', '最高承伤']);
    await expect(page.getByText('MVP', { exact: true })).toHaveCount(0);
    const player = rows.first().getByRole('button', { name: 'Fixture Enemy 1#192', exact: true });
    await expect(player).toHaveAttribute('title', 'Fixture Enemy 1#192');
    for (const width of [1184, 1000, 900]) {
      await page.setViewportSize({ width, height: 735 });
      const fits = await rows.evaluateAll(elements => elements.every(row => {
        const badges = [...row.querySelectorAll('[data-testid="history-highlight"]')];
        const bounds = row.getBoundingClientRect();
        return badges.length <= 3 && badges.every(badge => {
          const rect = badge.getBoundingClientRect();
          return rect.left >= bounds.left && rect.right <= bounds.right && rect.bottom <= bounds.bottom;
        });
      }));
      expect(fits).toBe(true);
      const score = rows.nth(2).getByTestId('match-score');
      await expect(score).toBeVisible();
      expect(await score.evaluate(node => {
        const rect = node.getBoundingClientRect();
        const row = node.parentElement!.getBoundingClientRect();
        const siblings = [...node.parentElement!.children].filter(child => child !== node);
        return row.right - rect.right < 16 && rect.right <= window.innerWidth &&
          Math.abs(rect.top + rect.bottom - row.top - row.bottom) < 2 &&
          siblings.every(child => child.getBoundingClientRect().right <= rect.left);
      })).toBe(true);
    }
    await page.setViewportSize({ width: 1184, height: 735 });
    await page.screenshot({ path: '/private/tmp/lol-personal-history-text-labels.png' });
    await player.click();
    await expect(page.getByRole('heading', { name: 'Fixture Enemy 1#192', exact: true })).toBeVisible();
  } finally { await app.close(); }
});

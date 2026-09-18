import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

test('live detail and overview only show custom awards and carry without overflow', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lol-live-awards-'));
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match', `--user-data-dir=${dir}`], env: { ...process.env, PLAYWRIGHT_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await page.getByRole('tab', { name: '对战信息' }).click();
    await expect(page.getByTestId('player-card')).toHaveCount(10);
    for (const mode of ['详细', '总览']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      const firstRow = page.getByTestId('player-card').first().getByTestId('recent-match').first();
      await expect(firstRow.locator('.recent-match__form')).toHaveText('CARRY');
      await expect(firstRow.getByTestId('match-score')).toBeVisible();
      if (mode === '总览') {
        await firstRow.hover();
        await expect(page.getByRole('tooltip').getByTestId('match-score')).toBeVisible();
        await page.getByRole('button', { name: '总览', exact: true }).hover();
      }
      for (const width of [1184, 900]) {
        await page.setViewportSize({ width, height: 735 });
        await expect(page.locator('.recent-match__award')).toHaveCount(0);
        expect(await page.getByTestId('match-score').evaluateAll(nodes => nodes.every(node =>
          getComputedStyle(node).backgroundColor === (node.classList.contains('is-win') ? 'rgb(223, 237, 245)' : 'rgb(244, 226, 226)')
        ))).toBe(true);
        expect(await page.locator('.recent-match__score').evaluateAll(nodes => nodes.every(node => {
          const score = node.getBoundingClientRect();
          const performance = node.closest('.recent-match__performance')!;
          const kda = performance.querySelector('.recent-match__kda')!.getBoundingClientRect();
          const honors = node.parentElement!.getBoundingClientRect();
          const bounds = performance.getBoundingClientRect();
          return score.bottom <= kda.top + 1 &&
            Math.abs(honors.left + honors.right - bounds.left - bounds.right) < 2;
        }))).toBe(true);
        expect(await page.locator('.recent-match__stats').evaluateAll(nodes => nodes.every(node => {
          const row = node.closest('.recent-match')!.getBoundingClientRect();
          const rect = node.getBoundingClientRect();
          return rect.left >= row.left && rect.right <= row.right;
        }))).toBe(true);
        expect(await page.locator('.recent-match__honors').evaluateAll(nodes => nodes.every(node => {
          const row = node.closest('.recent-match')!.getBoundingClientRect();
          return [...node.children].every(badge => {
            const rect = badge.getBoundingClientRect();
            return rect.left >= row.left && rect.right <= row.right && (badge.classList.contains('match-score') || badge.textContent === 'CARRY');
          });
        }))).toBe(true);
      }
      await page.setViewportSize({ width: 1184, height: 735 });
      await page.screenshot({ path: `/private/tmp/lol-live-score-${mode === '详细' ? 'detail' : 'overview'}.png` });
    }
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

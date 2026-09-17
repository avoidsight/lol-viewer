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
      await expect(firstRow.locator('.recent-match__honors > span')).toHaveCount(mode === '总览' ? 1 : 2);
      if (mode === '总览') {
        await firstRow.hover();
        await expect(page.getByRole('tooltip').locator('.recent-match__honors > span')).toHaveCount(2);
        await page.getByRole('button', { name: '总览', exact: true }).hover();
      }
      for (const width of [1184, 900]) {
        await page.setViewportSize({ width, height: 735 });
        await expect(page.locator('.recent-match__award').first()).toBeVisible();
        expect(await page.locator('.recent-match__honors').evaluateAll(nodes => nodes.every(node => {
          const row = node.closest('.recent-match')!.getBoundingClientRect();
          return [...node.children].every(badge => {
            const rect = badge.getBoundingClientRect();
            return rect.left >= row.left && rect.right <= row.right && ['MVP', 'SVP', 'CARRY'].includes(badge.textContent!);
          });
        }))).toBe(true);
      }
      await page.setViewportSize({ width: 1184, height: 735 });
      await page.screenshot({ path: `/private/tmp/lol-live-awards-${mode === '详细' ? 'detail' : 'overview'}.png` });
    }
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

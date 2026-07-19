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
    await page.getByRole('tab', { name: '英雄资料库' }).click();
    await expect(page.getByRole('heading', { name: '英雄资料库' })).toBeVisible();
    expect(Date.now() - startedAt).toBeLessThan(15_000);
  } finally {
    await app.close();
  }
});

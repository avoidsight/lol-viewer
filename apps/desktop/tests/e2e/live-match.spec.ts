import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';

test('fixture mode renders exactly ten players and one hundred records within fifteen seconds', async () => {
  const startedAt = Date.now();
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match'],
    env: { ...process.env, PLAYWRIGHT_TEST: '1' }
  });

  try {
    const page = await app.firstWindow();
    await expect(page.getByTestId('player-card')).toHaveCount(10);
    await expect(page.getByTestId('recent-match')).toHaveCount(100);
    expect(Date.now() - startedAt).toBeLessThan(15_000);
  } finally {
    await app.close();
  }
});

import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

test('input experiment defaults off and fixture cannot register a real shortcut', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'radar-input-'));
  const app = await electron.launch({ args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match', `--user-data-dir=${dir}`], env: { ...process.env, PLAYWRIGHT_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await page.getByRole('tab', { name: '设置', exact: true }).click();
    const input = page.getByRole('switch', { name: /游戏内填入战绩/ });
    await expect(input).not.toBeChecked();
    await input.click();
    await expect(page.getByText('无法开启：仅支持 Windows，请检查快捷键是否被占用。')).toBeVisible();
    await expect(input).not.toBeChecked();
    await expect(page.getByRole('switch', { name: /自动复制敌方战绩/ })).not.toBeChecked();
    await page.screenshot({ path: '/private/tmp/radar-game-input-settings.png' });
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});

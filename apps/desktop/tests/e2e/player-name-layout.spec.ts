import { _electron as electron, expect, test } from '@playwright/test';
import { join } from 'node:path';
import { createFixtureLiveMatch } from '../../src/main/fixtures/live-match';

test('long player IDs truncate without overlapping form labels in both modes', async () => {
  const data = createFixtureLiveMatch('ranked-solo');
  data.players.forEach((player, index) => {
    player.displayName = index % 2 === 0
      ? '这是一个非常非常长的召唤师名称用于测试显示#12345'
      : 'VeryLongUnbrokenSummonerNameForLayout#99999';
    player.matches.forEach((match, matchIndex) => {
      match.kills = 10;
      match.deaths = 2;
      match.assists = 12;
      match.killParticipation = index % 2 === 0 || matchIndex < 6 ? .7 : .4;
    });
  });
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match'],
    env: { ...process.env, PLAYWRIGHT_TEST: '1' }
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ ipcMain }, fixture) => {
      ipcMain.removeHandler('match:get-live');
      ipcMain.handle('match:get-live', () => fixture);
    }, data);
    await page.getByRole('tab', { name: '对战信息' }).click();
    await expect(page.locator('.player-form--elite')).toHaveCount(5);
    await expect(page.locator('.player-form--strong')).toHaveCount(5);
    for (const viewport of [{ width: 1184, height: 735 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport);
      for (const mode of ['详细', '总览']) {
        await page.getByRole('button', { name: mode, exact: true }).click();
        const results = await page.locator('.player-card__name-row').evaluateAll(rows => rows.map(row => {
          const name = row.querySelector('h3')!;
          const tag = row.querySelector<HTMLElement>('.player-form')!;
          const nameRect = name.getBoundingClientRect();
          const tagRect = tag.getBoundingClientRect();
          const bounds = row.getBoundingClientRect();
          return {
            separated: nameRect.right + 5 <= tagRect.left,
            fits: tagRect.right <= bounds.right + 1 && nameRect.left >= bounds.left - 1,
            truncated: name.scrollWidth > name.clientWidth,
            ellipsis: getComputedStyle(name).textOverflow === 'ellipsis',
            fullNameAvailable: name.title === name.textContent,
            tagComplete: tag.scrollWidth <= tag.clientWidth + 1
          };
        }));
        expect(results).toHaveLength(10);
        expect(results.every(result => Object.values(result).every(Boolean))).toBe(true);
      }
    }
  } finally {
    await app.close();
  }
});

import { expect, it } from 'vitest';
import { createFixtureLiveMatch } from '../main/fixtures/live-match';
import { enemyHistorySummary } from './enemy-history';

function fixture() {
  const match = { ...createFixtureLiveMatch('all'), gameId: '123', localTeamId: 100, queueId: 420 };
  const enemies = match.players.filter(p => p.teamId !== 100);
  enemies.forEach((p, index) => {
    p.status = 'ready'; p.championName = `英雄${index}`;
    p.matches = Array.from({ length: 10 }, (_, i) => ({ matchId: String(i), queueId: 420, endedAt: 100 - i,
      durationSeconds: 1800, championId: 99, win: true, kills: 10, deaths: 4, assists: 14,
      teamDamageShare: .35, teamDamageTakenShare: .35, killParticipation: .75 }));
  });
  return { match, enemies };
}
it('highlights at most two current champions using shared player labels', () => {
  const { match } = fixture();
  const text = enemyHistorySummary(match)!;
  expect(text).toContain('英雄0【通天代】近10场10胜，10场CARRY');
  expect(text).toContain('英雄1'); expect(text).not.toContain('英雄2');
});
it('highlights only the leader with an eight point lead', () => {
  const { match, enemies } = fixture();
  enemies.slice(1).forEach(p => { p.matches = p.matches.map(m => ({ ...m, teamDamageShare: .25 })); });
  expect(enemyHistorySummary(match)).toContain('英雄0');
  expect(enemyHistorySummary(match)).not.toContain('英雄1');
});
it('sanitizes fallback player names and discloses missing opponents', () => {
  const { match, enemies } = fixture();
  enemies[0].championName = undefined; enemies[0].displayName = '/all\n玩家\u202e';
  enemies[4].status = 'unavailable';
  const text = enemyHistorySummary(match)!;
  expect(text).toContain('仅比较已知战绩'); expect(text).toContain('all玩家');
  expect(text).not.toMatch(/[\n\u202e/]/);
  enemies[3].status = 'unavailable'; enemies[2].status = 'unavailable';
  expect(enemyHistorySummary(match)).toContain('样本不足');
});
it('does not force a leader among ordinary records or rate non-ranked games', () => {
  const { match, enemies } = fixture();
  enemies.forEach(p => { p.matches = p.matches.map(m => ({ ...m, teamDamageShare: .2, teamDamageTakenShare: .2, killParticipation: .4, deaths: 10 })); });
  expect(enemyHistorySummary(match)).toContain('暂无明显突出');
  match.queueId = 450;
  expect(enemyHistorySummary(match)).toContain('全部模式');
  expect(enemyHistorySummary(match)).not.toContain('重点');
});

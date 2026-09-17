import type { LiveMatch } from './ipc';
import { isRankedQueue } from './queue';
import { rankedForm } from './ranked-form';
export const ENEMY_HISTORY_COPIED_CHANNEL = 'match:enemy-history-copied';
const lanes = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
const laneNames: Record<string, string> = { TOP: '上路', JUNGLE: '打野', MIDDLE: '中路', BOTTOM: '下路', UTILITY: '辅助' };
function cleanName(value: string): string {
  // Keep player-controlled names on one line and out of chat-command syntax.
  return [...value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069/\\]/g, '').trim()].slice(0, 24).join('') || '未知玩家';
}
export function enemyHistorySummary(match: LiveMatch): string | undefined {
  if (!match.gameId || match.gameId === '0' || match.localTeamId == null) return;
  const allies = match.players.filter(p => p.teamId === match.localTeamId);
  const enemies = match.players.filter(p => p.teamId !== match.localTeamId);
  if (allies.length !== 5 || enemies.length !== 5 || new Set(enemies.map(p => p.teamId)).size !== 1 || enemies.some(p => p.status === 'loading')) return;
  const ranked = isRankedQueue(match.queueId);
  if (!enemies.some(p => p.status === 'ready' && p.matches.length)) return;
  if (ranked) {
    const evaluated = enemies.filter(p => p.status === 'ready').flatMap(player => {
      const form = rankedForm(player.matches);
      return form ? [{ player, form }] : [];
    }).sort((a, b) => b.form.averageScore - a.form.averageScore);
    if (evaluated.length < 3) return '对面近期排位战绩不足，暂无法判断。';
    const candidates = evaluated.filter(entry => entry.form.averageScore >= 70).slice(0, 2);
    if (!candidates.length) return `对面近期暂无明显突出选手${evaluated.length < 5 ? '（部分玩家战绩缺失）' : ''}。`;
    if (candidates.length === 2 && candidates[0].form.averageScore - candidates[1].form.averageScore >= 8) candidates.pop();
    const parts = candidates.map(({ player, form }) => {
      const name = player.championName?.trim() || player.displayName;
      const tag = form.tier === 'elite' || form.tier === 'strong' ? `【${form.label}】` : '';
      return `${cleanName(name)}${tag}近${form.sampleSize}场${form.wins}胜，${form.carry}场CARRY`;
    });
    return `对面重点${evaluated.length < 5 ? '（部分玩家战绩缺失）' : ''}：${parts.join('；')}。`;
  }
  let available = 0;
  const ordered = match.positionOrderReliable ? [...enemies].sort((a, b) => lanes.indexOf(a.lane) - lanes.indexOf(b.lane)) : enemies;
  const lines = ordered.map(player => {
    const seen = new Set<string>();
    const recent = player.status === 'ready' ? [...player.matches]
      .filter(m => !m.remake && (!ranked || isRankedQueue(m.queueId)))
      .sort((a, b) => b.endedAt - a.endedAt)
      .filter(m => { if (seen.has(m.matchId)) return false; seen.add(m.matchId); return true; }).slice(0, 10) : [];
    const prefix = match.positionOrderReliable && laneNames[player.lane] ? `${laneNames[player.lane]} ` : '';
    if (!recent.length) return `${prefix}${cleanName(player.displayName)}：暂无数据`;
    available++;
    const wins = recent.filter(m => m.win).length;
    return `${prefix}${cleanName(player.displayName)}：近${recent.length}场${wins}胜${recent.length - wins}负`;
  });
  if (!available) return;
  return `敌方近期${ranked ? '排位（单双/灵活）' : '全部模式'}战绩：${lines.join('；')}`;
}

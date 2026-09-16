import type { MatchSummary, MatchAchievementType } from '../../../../shared/domain';
import { rankedMatchForm } from '../live/ranked-form';

export interface HistoryHighlight { key: string; label: string; tone: string; description: string }
const multiKills = { 2: '双杀', 3: '三杀', 4: '四杀', 5: '五杀' } as const;
const metrics: Array<[MatchAchievementType, string, string]> = [
  ['MOST_DAMAGE', '最高输出', 'damage'],
  ['MOST_DAMAGE_TAKEN', '最高承伤', 'tank']
];

// Carry > legendary > multi-kill > damage > tanking; at most three badges.
export function historyHighlights(match: MatchSummary): HistoryHighlight[] {
  const badges: HistoryHighlight[] = [];
  const form = rankedMatchForm(match);
  if (form?.tier === 'carry') badges.push({ key: 'carry', label: 'CARRY', tone: 'gold', description: `本应用排位表现评估，非官方评分。${form.description}` });
  if (Number.isInteger(match.largestKillingSpree) && match.largestKillingSpree! >= 8) badges.push({ key: 'legendary', label: '超神', tone: 'legendary', description: '本场曾达成连续击杀至少 8 人，期间未死亡' });
  if (match.multiKill && match.multiKill >= 3 && multiKills[match.multiKill]) badges.push({ key: 'multi', label: multiKills[match.multiKill], tone: 'multi', description: '本场最高多杀（三杀及以上），以客户端记录为准' });
  for (const [type, label, tone] of metrics) {
    if (match.achievements?.some(achievement => achievement.type === type)) badges.push({ key: type, label, tone, description: `${label}（本场双方玩家比较，含并列）` });
  }
  return badges.slice(0, 3);
}

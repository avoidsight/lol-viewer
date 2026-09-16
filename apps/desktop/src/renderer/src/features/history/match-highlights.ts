import type { MatchSummary, MatchAchievementType } from '../../../../shared/domain';
import { rankedMatchForm } from '../live/ranked-form';

export interface HistoryHighlight { key: string; label: string; tone: string; description: string }
const multiKills = { 2: '双杀', 3: '三杀', 4: '四杀', 5: '五杀' } as const;
const metrics: Array<[MatchAchievementType, string, string]> = [
  ['MOST_DAMAGE', '最高伤害', 'damage'],
  ['MOST_DAMAGE_TAKEN', '最高承伤', 'tank'],
  ['MOST_GOLD', '最高经济', 'gold'],
  ['MOST_ASSISTS', '最多助攻', 'assist'],
  ['MOST_KILLS', '最多击杀', 'damage'],
  ['MOST_CS', '最多补刀', 'assist']
];

// Stable priority, at most three visible badges. MVP and Carry share one slot.
export function historyHighlights(match: MatchSummary): HistoryHighlight[] {
  const badges: HistoryHighlight[] = [];
  if (match.multiKill && multiKills[match.multiKill]) badges.push({ key: 'multi', label: multiKills[match.multiKill], tone: 'multi', description: '本场最高多杀，以客户端记录为准' });
  if (Number.isInteger(match.largestKillingSpree) && match.largestKillingSpree! >= 8) badges.push({ key: 'legendary', label: '超神', tone: 'legendary', description: '本场曾达成连续击杀至少 8 人，期间未死亡' });
  const form = rankedMatchForm(match);
  if (match.mvp) badges.push({ key: 'mvp', label: 'MVP', tone: 'gold', description: '客户端提供的 MVP 标记' });
  else if (form?.tier === 'carry') badges.push({ key: 'carry', label: 'CARRY', tone: 'gold', description: `本应用排位表现评估，非官方评分。${form.description}` });
  for (const [type, label, tone] of metrics) {
    if (match.achievements?.some(achievement => achievement.type === type)) badges.push({ key: type, label, tone, description: `${label}（本场双方玩家比较，含并列）` });
  }
  return badges.slice(0, 3);
}

import type { MatchSummary } from '../../../../shared/domain';
import { isRankedQueue } from '../../../../shared/queue';

export function rankedMatchForm(match: MatchSummary) {
  if (!isRankedQueue(match.queueId) || match.remake || match.durationSeconds < 600
    || !Number.isFinite(match.durationSeconds) || !Number.isFinite(match.endedAt)
    || ![match.kills, match.deaths, match.assists].every(value => Number.isInteger(value) && value >= 0)
    || match.killParticipation === undefined || !Number.isFinite(match.killParticipation)
    || match.killParticipation < 0 || match.killParticipation > 1) return undefined;
  const kp = match.killParticipation;
  const kda = (match.kills + match.assists) / Math.max(1, match.deaths);
  const deathsPerTen = match.deaths * 600 / match.durationSeconds;
  const tier = kp >= .55 && kda >= 3 && deathsPerTen <= 2.5 ? 'carry'
    : kp < .35 && kda < 1.5 && deathsPerTen >= 3 ? 'rough' : 'normal';
  const label = { carry: 'Carry局', normal: '正常局', rough: '吃力局' }[tier];
  return { tier, label, description: `${label} · 参团率${Math.round(kp * 100)}% · KDA ${kda.toFixed(1)} · 每10分钟死亡${deathsPerTen.toFixed(1)}次` };
}

export function rankedForm(matches: MatchSummary[]) {
  // Evaluate only the latest ten ranked games already available, never fetch more for a label.
  const seen = new Set<string>();
  const recent = [...matches].filter(match => isRankedQueue(match.queueId))
    .sort((a, b) => b.endedAt - a.endedAt)
    .filter(match => { if (seen.has(match.matchId)) return false; seen.add(match.matchId); return true; })
    .slice(0, 10);
  const valid = recent.map(rankedMatchForm).filter(form => form !== undefined);
  if (valid.length < 5 || valid.length < recent.length * .8) return undefined;
  const carry = valid.filter(form => form.tier === 'carry').length;
  const struggling = valid.filter(form => form.tier === 'rough').length;
  const n = valid.length;
  const tier = n >= 8 && carry / n >= .8 && struggling === 0 ? 'elite'
    : carry / n >= .6 && struggling / n <= .2 ? 'strong'
      : struggling / n >= .6 && carry / n <= .2 ? 'rough' : 'regular';
  const label = { elite: '通天代', strong: '小代', regular: '本地人', rough: '小坑' }[tier];
  const reason = `${carry}场Carry局、${n - carry - struggling}场正常局、${struggling}场吃力局`;
  return { tier, label, description: `已获取的最近${recent.length}场排位中，${n}场有效（单双排/灵活排位）。${reason}。排除重开、短于10分钟及关键数据缺失的对局。仅反映近期排位表现，不代表实际段位或代练判断。` };
}

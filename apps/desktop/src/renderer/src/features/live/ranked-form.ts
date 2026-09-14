import type { MatchSummary } from '../../../../shared/domain';
import { isRankedQueue } from '../../../../shared/queue';

export function rankedForm(matches: MatchSummary[]) {
  // Evaluate only the latest ten ranked games already available, never fetch more for a label.
  const seen = new Set<string>();
  const recent = [...matches].filter(match => isRankedQueue(match.queueId))
    .sort((a, b) => b.endedAt - a.endedAt)
    .filter(match => { if (seen.has(match.matchId)) return false; seen.add(match.matchId); return true; })
    .slice(0, 10);
  const valid = recent.filter(match => !match.remake && match.durationSeconds >= 600
    && Number.isFinite(match.durationSeconds) && Number.isFinite(match.endedAt)
    && [match.kills, match.deaths, match.assists].every(value => Number.isInteger(value) && value >= 0)
    && match.killParticipation !== undefined && Number.isFinite(match.killParticipation)
    && match.killParticipation >= 0 && match.killParticipation <= 1);
  if (valid.length < 5 || valid.length < recent.length * .8) return undefined;
  let bright = 0, dominant = 0, struggling = 0;
  for (const match of valid) {
    const kp = match.killParticipation!;
    const kda = (match.kills + match.assists) / Math.max(1, match.deaths);
    const deathsPerTen = match.deaths * 600 / match.durationSeconds;
    if (kp >= .55 && kda >= 3 && deathsPerTen <= 2.5) bright++;
    if (kp >= .65 && kda >= 5 && deathsPerTen <= 1.5) dominant++;
    if (kp < .35 && kda < 1.5 && deathsPerTen >= 3) struggling++;
  }
  const n = valid.length;
  const tier = n >= 8 && dominant / n >= .75 && struggling === 0 ? 'elite'
    : bright / n >= .6 && struggling / n <= .2 ? 'strong'
      : struggling / n >= .6 && bright / n <= .2 ? 'rough' : 'regular';
  const label = { elite: '通天代', strong: '小代', regular: '本地人', rough: '小坑' }[tier];
  const reason = tier === 'elite' ? `${dominant}场参团≥65%、KDA≥5、每10分钟死亡≤1.5`
    : tier === 'strong' ? `${bright}场参团≥55%、KDA≥3、每10分钟死亡≤2.5`
      : tier === 'rough' ? `${struggling}场参团<35%、KDA<1.5、每10分钟死亡≥3`
        : '未达到持续高光或持续吃力的阈值，可能包含表现起伏';
  return { tier, label, description: `已获取的最近${recent.length}场排位中，${n}场有效（单双排/灵活排位）。${reason}。排除重开、短于10分钟及关键数据缺失的对局。仅反映近期排位表现，不代表实际段位或代练判断。` };
}

import type { MatchSummary } from './domain';
import { isRankedQueue } from './queue';

// Product heuristics, not official ratings. All positions use identical parameters.
export const FORM_SCORING = {
  weights: { damage: .35, taken: .15, participation: .25, kda: .25 },
  share: [[.1, 0], [.2, 40], [.25, 65], [.3, 85], [.35, 100]],
  participation: [[.2, 0], [.4, 35], [.5, 55], [.6, 75], [.75, 100]],
  kda: [[1, 0], [2, 35], [3, 60], [4, 78], [6, 100]],
  carry: 75,
} as const;
export function metricScore(value: number, anchors: readonly (readonly [number, number])[]): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [x, y] = anchors[i];
    const [px, py] = anchors[i - 1];
    if (value <= x) return py + (y - py) * (value - px) / (x - px);
  }
  return anchors[anchors.length - 1][1];
}
const ratio = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0 && value <= 1;

export function rankedMatchForm(match: MatchSummary) {
  if (!isRankedQueue(match.queueId) || match.remake || match.durationSeconds < 600
    || !Number.isFinite(match.durationSeconds) || !Number.isFinite(match.endedAt)
    || ![match.kills, match.deaths, match.assists].every(value => Number.isInteger(value) && value >= 0)
    || !ratio(match.teamDamageShare) || !ratio(match.killParticipation)
    || (match.teamDamageTakenShare !== undefined && !ratio(match.teamDamageTakenShare))) return undefined;
  const kda = (match.kills + match.assists) / Math.max(1, match.deaths);
  const complete = match.teamDamageTakenShare !== undefined;
  const weights = FORM_SCORING.weights;
  const components = {
    damage: metricScore(match.teamDamageShare, FORM_SCORING.share),
    taken: complete ? metricScore(match.teamDamageTakenShare!, FORM_SCORING.share) * Math.min(1, kda / 2) : 0,
    participation: metricScore(match.killParticipation, FORM_SCORING.participation),
    kda: metricScore(kda, FORM_SCORING.kda),
  };
  // Only damage taken may be missing: remaining original weights cover 85%.
  const score = (components.damage * weights.damage + components.taken * weights.taken
    + components.participation * weights.participation + components.kda * weights.kda) / (complete ? 1 : .85);
  const deathsPerTen = match.deaths * 600 / match.durationSeconds;
  const tier = score >= FORM_SCORING.carry ? 'carry'
    : match.killParticipation < .35 && kda < 1.5 && deathsPerTen >= 3 ? 'rough' : 'normal';
  const label = { carry: 'Carry局', normal: '正常局', rough: '吃力局' }[tier];
  return { tier, label, score, complete, components,
    description: `${label} · 伤害${Math.round(match.teamDamageShare * 100)}% · 承伤${complete ? `${Math.round(match.teamDamageTakenShare! * 100)}%` : '暂无数据'} · 参团${Math.round(match.killParticipation * 100)}% · KDA ${kda.toFixed(1)}` };
}

export function rankedForm(matches: MatchSummary[]) {
  const seen = new Set<string>();
  const recent = [...matches].filter(m => isRankedQueue(m.queueId) && !m.remake
    && Number.isFinite(m.endedAt) && Number.isFinite(m.durationSeconds) && m.durationSeconds >= 600)
    .sort((a, b) => b.endedAt - a.endedAt)
    .filter(m => { if (seen.has(m.matchId)) return false; seen.add(m.matchId); return true; }).slice(0, 10);
  const valid = recent.map(rankedMatchForm).filter(form => form !== undefined);
  if (valid.length < 5 || valid.length < recent.length * .8) return undefined;
  const n = valid.length;
  const carry = valid.filter(form => form.tier === 'carry').length;
  const struggling = valid.filter(form => form.tier === 'rough').length;
  const averageScore = valid.reduce((sum, form) => sum + form.score, 0) / n;
  const tier = n >= 8 && averageScore >= 82 && carry / n >= .7 ? 'elite'
    : averageScore >= 70 && carry / n >= .4 ? 'strong'
      : struggling / n >= .6 && carry / n <= .2 ? 'rough' : 'regular';
  const label = { elite: '通天代', strong: '小代', regular: '本地人', rough: '小坑' }[tier];
  return { tier, label, averageScore, carry, sampleSize: recent.length, validCount: n,
    wins: recent.filter(m => m.win).length,
    description: `近${recent.length}场排位${n < recent.length ? `（${n}场可评估）` : ''}：${carry}场Carry、${n - carry - struggling}场正常、${struggling}场吃力。根据近期表现评估，不代表实际段位。` };
}

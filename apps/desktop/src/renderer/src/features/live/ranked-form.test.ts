import { describe, expect, it } from 'vitest';
import type { MatchSummary } from '../../../../shared/domain';
import { rankedForm, rankedMatchForm } from './ranked-form';
import { FORM_SCORING, metricScore } from '../../../../shared/ranked-form';
const games = (count: number, overrides: Partial<MatchSummary> = {}): MatchSummary[] => Array.from({ length: count }, (_, i) => ({ matchId: String(i), queueId: i % 2 ? 440 : 420, endedAt: 10000 - i, durationSeconds: 1800, championId: 1, win: false, kills: 4, deaths: 4, assists: 8, killParticipation: .5, teamDamageShare: .25, teamDamageTakenShare: .25, ...overrides }));
const strong = { kills: 10, assists: 14, deaths: 4, teamDamageShare: .35, teamDamageTakenShare: .35, killParticipation: .75 };
describe('uniform ranked scoring', () => {
  it('interpolates monotonically and caps all metrics', () => {
    expect(metricScore(.275, FORM_SCORING.share)).toBeCloseTo(75);
    expect(metricScore(.05, FORM_SCORING.share)).toBe(0);
    expect(metricScore(1, FORM_SCORING.share)).toBe(100);
    for (const anchors of [FORM_SCORING.share, FORM_SCORING.participation, FORM_SCORING.kda]) {
      let previous = 0;
      for (let x = 0; x <= 10; x += .01) {
        const score = metricScore(x, anchors);
        expect(score).toBeGreaterThanOrEqual(previous); expect(score).toBeLessThanOrEqual(100);
        previous = score;
      }
    }
  });
  it('uses the exact same weights irrespective of lane, champion or victory', () => {
    const base = games(1, strong)[0];
    expect(rankedMatchForm(base)?.score).toBe(100);
    for (const lane of ['TOP', 'UTILITY', 'BOTTOM', 'MIDDLE', 'JUNGLE', 'UNKNOWN'] as const)
      expect(rankedMatchForm({ ...base, lane, championId: 99, win: true })?.score).toBe(100);
    expect(rankedMatchForm(games(1)[0])?.score).toBeCloseTo(61.25);
    expect(rankedMatchForm(games(1)[0])?.tier).toBe('normal');
  });
  it('classifies at 75 without rounding before comparison', () => {
    const base = games(1, { ...strong, teamDamageShare: .2 })[0]; // 79
    expect(rankedMatchForm(base)?.score).toBeCloseTo(79);
    expect(rankedMatchForm({ ...base, teamDamageShare: .17 })?.tier).toBe('normal');
    expect(rankedMatchForm({ ...base, teamDamageShare: .18 })?.tier).toBe('carry');
  });
  it('does not reward dying just to accumulate damage taken', () => {
    const result = rankedMatchForm(games(1, { kills: 2, assists: 8, deaths: 10, teamDamageTakenShare: .5 })[0])!;
    expect(result.components.taken).toBe(50);
    expect(result.tier).not.toBe('carry');
  });
  it('allows only the missing low-weight metric and validates ratios', () => {
    const base = games(1, strong)[0];
    expect(rankedMatchForm({ ...base, teamDamageTakenShare: undefined })?.score).toBeCloseTo(100);
    expect(rankedMatchForm({ ...base, teamDamageTakenShare: undefined })?.description).toContain('承伤暂无数据');
    for (const field of ['teamDamageShare', 'killParticipation'] as const)
      expect(rankedMatchForm({ ...base, [field]: undefined })).toBeUndefined();
    for (const field of ['teamDamageShare', 'teamDamageTakenShare', 'killParticipation'] as const)
      for (const value of [NaN, Infinity, -.1, 1.1])
        expect(rankedMatchForm({ ...base, [field]: value })).toBeUndefined();
    expect(rankedMatchForm({ ...base, deaths: 0 })?.score).toBe(100);
  });
  it('requires five valid samples, 80% coverage, and ranked non-remakes', () => {
    for (const data of [games(4), games(10, { queueId: 450 }), games(10, { remake: true }), games(10, { durationSeconds: 599 }), games(10, { matchId: 'same' }), games(10, { endedAt: NaN })])
      expect(rankedForm(data)).toBeUndefined();
    expect(rankedForm(games(10).map((m, i) => i < 3 ? { ...m, teamDamageShare: undefined } : m))).toBeUndefined();
    expect(rankedForm(games(10).map((m, i) => i < 2 ? { ...m, teamDamageShare: undefined } : m))?.validCount).toBe(8);
  });
  it('uses average score and carry proportion, limits latest ten and preserves negative rule', () => {
    expect(rankedForm(games(5, strong))?.label).toBe('小代');
    expect(rankedForm(games(8, strong))?.label).toBe('通天代');
    const fourCarry = games(10).map((m, i) => i < 4 ? { ...m, ...strong } : m);
    expect(rankedForm(fourCarry)?.label).toBe('小代');
    expect(rankedForm(games(10).map((m, i) => i < 7 ? { ...m, ...strong } : m))?.label).toBe('通天代');
    expect(rankedForm(games(10))?.label).toBe('本地人');
    expect(rankedForm(games(10, { kills: 1, assists: 2, deaths: 10, killParticipation: .2 }))?.label).toBe('小坑');
    const old = games(10, strong).map(m => ({ ...m, matchId: 'old' + m.matchId, endedAt: 0 }));
    expect(rankedForm([...games(10), ...old])?.label).toBe('本地人');
  });
});

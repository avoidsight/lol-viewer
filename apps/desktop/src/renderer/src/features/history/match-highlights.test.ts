import { describe, expect, it } from 'vitest';
import type { MatchSummary } from '../../../../shared/domain';
import { historyHighlights } from './match-highlights';

const match: MatchSummary = { matchId: '1', queueId: 420, endedAt: 1, durationSeconds: 1800, championId: 1, win: true, kills: 12, deaths: 2, assists: 10 };
describe('personal history text highlights', () => {
  it('does not invent honors from total kills or KDA alone', () => {
    expect(historyHighlights(match)).toEqual([]);
    expect(historyHighlights({ ...match, largestKillingSpree: 7 })).toEqual([]);
    expect(historyHighlights({ ...match, largestKillingSpree: 8 }).map(x => x.label)).toEqual(['超神']);
  });
  it('caps three honors and prioritizes multi-kill, legendary and MVP over Carry', () => {
    expect(historyHighlights({ ...match, killParticipation: .8, largestKillingSpree: 9, multiKill: 5, mvp: true, achievements: [{ type: 'MOST_DAMAGE', value: 100 }] }).map(x => x.label)).toEqual(['五杀', '超神', 'MVP']);
  });
  it('uses existing ranked Carry logic and keeps highest damage/tanking readable', () => {
    const data: MatchSummary = { ...match, killParticipation: .8, achievements: [{ type: 'MOST_DAMAGE_TAKEN', value: 10 }, { type: 'MOST_DAMAGE', value: 10 }, { type: 'MOST_GOLD', value: 10 }] };
    expect(historyHighlights(data).map(x => x.label)).toEqual(['CARRY', '最高伤害', '最高承伤']);
    expect(historyHighlights({ ...data, queueId: 450 }).map(x => x.label)).toEqual(['最高伤害', '最高承伤', '最高经济']);
    expect(historyHighlights({ ...data, remake: true }).some(x => x.label === 'CARRY')).toBe(false);
  });
  it.each([2, 3, 4, 5] as const)('shows one highest multi-kill badge (%s)', multiKill => {
    expect(historyHighlights({ ...match, multiKill })).toHaveLength(1);
  });
});

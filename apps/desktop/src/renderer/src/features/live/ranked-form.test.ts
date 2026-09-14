import { describe, expect, it } from 'vitest';
import type { MatchSummary } from '../../../../shared/domain';
import { rankedForm } from './ranked-form';

const games = (count: number, overrides: Partial<MatchSummary> = {}): MatchSummary[] => Array.from({ length: count }, (_, i) => ({ matchId: String(i), queueId: i % 2 ? 440 : 420, endedAt: 10000 - i, durationSeconds: 1800, championId: 1, win: false, kills: 4, deaths: 5, assists: 6, killParticipation: .45, ...overrides }));
describe('rankedForm', () => {
  it('requires five complete ranked samples and ignores normals and duplicate games', () => {
    expect(rankedForm(games(4))).toBeUndefined();
    expect(rankedForm(games(10, { queueId: 450 }))).toBeUndefined();
    expect(rankedForm(games(10, { killParticipation: undefined }))).toBeUndefined();
    expect(rankedForm(games(10, { matchId: 'same' }))).toBeUndefined();
    expect(rankedForm(games(10, { remake: true }))).toBeUndefined();
    expect(rankedForm(games(10, { durationSeconds: 599 }))).toBeUndefined();
  });
  it('labels ordinary games without using wins as performance', () => {
    expect(rankedForm(games(10))?.label).toBe('本地人');
    expect(rankedForm(games(10, { win: true }))?.label).toBe('本地人');
  });
  it('recognizes support assists and requires eight dominant games for elite', () => {
    const strong = { kills: 0, assists: 20, deaths: 3, killParticipation: .7 };
    expect(rankedForm(games(5, strong))?.label).toBe('小代');
    expect(rankedForm(games(8, strong))?.label).toBe('通天代');
  });
  it('only flags repeated low involvement plus high deaths and poor KDA', () => {
    expect(rankedForm(games(10, { kills: 1, assists: 2, deaths: 10, killParticipation: .2 }))?.label).toBe('小坑');
    expect(rankedForm(games(10, { kills: 1, assists: 2, deaths: 10, killParticipation: .7 }))?.label).toBe('本地人');
  });
  it('rejects insufficient coverage and invalid data, limits to latest ten', () => {
    expect(rankedForm([...games(5), ...games(5, { matchId: 'bad', killParticipation: NaN })])?.label).toBe('本地人');
    expect(rankedForm(games(10).map((m, i) => i < 3 ? { ...m, killParticipation: undefined } : m))).toBeUndefined();
    expect(rankedForm([...games(10, { kills: 0, assists: 20, deaths: 3, killParticipation: .7 }), ...games(10).map(m => ({ ...m, matchId: `old-${m.matchId}`, endedAt: 0 }))])?.label).toBe('通天代');
  });
});

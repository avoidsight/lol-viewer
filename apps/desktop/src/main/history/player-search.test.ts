import { describe, expect, it, vi } from 'vitest';
import { searchPlayer } from './player-search';
import { playerSearchInputSchema } from '../../shared/player-search';

describe('player search', () => {
  it('resolves exact name and tag into a history target', async () => {
    const postJson = vi.fn().mockResolvedValue([{ summonerId: 42, puuid: 'p', gameName: '测试', tagLine: '123', profileIconId: 8 }]);
    expect(await searchPlayer({ get: vi.fn(), postJson }, ' 测试 #123 ')).toEqual({ ok: true, target: { playerId: '42', puuid: 'p', displayName: '测试#123', profileIconId: 8 } });
    expect(postJson).toHaveBeenCalledWith('/lol-summoner/v1/summoners/aliases', [{ gameName: '测试', tagLine: '123' }], expect.anything());
  });
  it('does not select a mismatched player', async () => {
    expect(await searchPlayer({ get: vi.fn(), postJson: vi.fn().mockResolvedValue([]) }, '测试#123')).toEqual({ ok: false, error: 'not-found' });
    expect(await searchPlayer({ get: vi.fn(), postJson: vi.fn().mockResolvedValue([{ gameName: '其他', tagLine: '123' }]) }, '测试#123')).toEqual({ ok: false, error: 'not-found' });
  });
  it('distinguishes connection failure from query failure', async () => {
    for (const [code, error] of [['LCU_AUTH', 'unavailable'], ['LCU_UNAVAILABLE', 'unavailable'], ['LCU_INVALID_RESPONSE', 'failed']] as const) {
      expect(await searchPlayer({ get: vi.fn(), postJson: vi.fn().mockRejectedValue({ code }) }, '测试#123')).toEqual({ ok: false, error });
    }
  });
  it.each(['测试', '测试#', '#123', 'a#b#c', 'a\n#123', 'a'.repeat(101)])('rejects invalid input %s', input => {
    expect(playerSearchInputSchema.safeParse(input).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { formatRank, localizeRank } from './rank';

describe('formatRank', () => {
  it.each([
    ['IRON', 'IV', 0, '黑铁 IV 0 胜点'],
    ['BRONZE', 'III', 12, '青铜 III 12 胜点'],
    ['SILVER', 'II', 34, '白银 II 34 胜点'],
    ['GOLD', 'I', 60, '黄金 I 60 胜点'],
    ['PLATINUM', 'IV', 12, '铂金 IV 12 胜点'],
    ['EMERALD', 'III', 25, '翡翠 III 25 胜点'],
    ['DIAMOND', 'II', 41, '钻石 II 41 胜点'],
    ['MASTER', '', 200, '大师 200 胜点'],
    ['GRANDMASTER', '', 500, '宗师 500 胜点'],
    ['CHALLENGER', '', 1000, '王者 1000 胜点']
  ])('localizes %s rank', (tier, division, leaguePoints, expected) => {
    expect(formatRank(tier, division, leaguePoints)).toBe(expected);
  });

  it('localizes an English rank restored from an older cache', () => {
    expect(localizeRank('GOLD II 42 LP')).toBe('黄金 II 42 胜点');
    expect(localizeRank('黄金 II 42 胜点')).toBe('黄金 II 42 胜点');
  });
  it('returns undefined for Tencent unranked sentinel values', () => {
    expect(formatRank('NA', '', 0)).toBeUndefined();
  });
});
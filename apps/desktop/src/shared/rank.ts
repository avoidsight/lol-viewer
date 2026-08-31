const tierNames: Record<string, string> = {
  IRON: '黑铁',
  BRONZE: '青铜',
  SILVER: '白银',
  GOLD: '黄金',
  PLATINUM: '铂金',
  EMERALD: '翡翠',
  DIAMOND: '钻石',
  MASTER: '大师',
  GRANDMASTER: '宗师',
  CHALLENGER: '王者'
};

export function formatRank(tier: string, division: string, leaguePoints: number): string | undefined {
  const normalizedTier = tier.trim().toUpperCase();
  const tierName = tierNames[normalizedTier];
  if (!tierName) return undefined;
  return [tierName, division.trim().toUpperCase(), `${leaguePoints} 胜点`].filter(Boolean).join(' ');
}

export function localizeRank(rank: string | undefined): string | undefined {
  if (!rank) return undefined;
  const match = rank.trim().match(/^(IRON|BRONZE|SILVER|GOLD|PLATINUM|EMERALD|DIAMOND|MASTER|GRANDMASTER|CHALLENGER)\s*(I{1,3}|IV)?\s*(\d+)\s*LP$/i);
  return match ? formatRank(match[1], match[2] ?? '', Number(match[3])) : rank;
}
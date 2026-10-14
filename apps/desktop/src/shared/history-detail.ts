import type { MatchSummary } from './domain';

export function hasCompleteMatchDetails(match: MatchSummary): boolean {
  return [match.allyPlayers, match.enemyPlayers].every(team => team?.length === 5 && team.every(player =>
    player.kills !== undefined && player.deaths !== undefined && player.assists !== undefined
    && player.goldEarned !== undefined && player.damage !== undefined && player.damageTaken !== undefined && player.itemIds !== undefined));
}

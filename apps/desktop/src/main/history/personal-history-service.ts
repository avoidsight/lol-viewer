import { z } from 'zod';
import type { FavoriteChampion, PersonalHistorySnapshot } from '../../shared/domain';
import { personalHistorySchema } from '../../shared/ipc';
import type { PersonalHistoryCache } from '../cache/database';
import type { LcuClient } from '../lcu/http-client';
import { adaptMatchHistory, matchHistoryResponseSchema } from '../lcu/match-adapter';

const currentSummonerSchema = z.object({
  summonerId: z.union([z.string(), z.number()]),
  displayName: z.string(),
  profileIconId: z.number().int().nonnegative()
});
const rankedStatsSchema = z.object({
  queues: z.array(z.object({
    queueType: z.string(), tier: z.string(), division: z.string(), leaguePoints: z.number().int()
  }))
});
const assetVersionSchema = z.string().regex(/^\d+\.\d+(?:\.\d+){0,2}$/);

function unavailable(): Error & { code: 'HISTORY_UNAVAILABLE' } {
  return Object.assign(new Error('Personal history is unavailable'), { code: 'HISTORY_UNAVAILABLE' as const });
}

function favoriteChampions(matches: PersonalHistorySnapshot['matches']): FavoriteChampion[] {
  const groups = new Map<number, { games: number; wins: number }>();
  for (const match of matches) {
    const group = groups.get(match.championId) ?? { games: 0, wins: 0 };
    group.games += 1;
    if (match.win) group.wins += 1;
    groups.set(match.championId, group);
  }
  return [...groups.entries()]
    .map(([championId, group]) => ({
      championId, games: group.games, wins: group.wins, winRate: group.wins / group.games
    }))
    .sort((left, right) => right.games - left.games || left.championId - right.championId)
    .slice(0, 5);
}

export class PersonalHistoryService {
  constructor(
    private readonly client: LcuClient,
    private readonly cache: Pick<PersonalHistoryCache, 'getFresh' | 'getLatest' | 'put'>
  ) {}

  async load(): Promise<PersonalHistorySnapshot> {
    let playerId: string | undefined;
    try {
      const summoner = currentSummonerSchema.parse(
        await this.client.get('/lol-summoner/v1/current-summoner', currentSummonerSchema)
      );
      playerId = String(summoner.summonerId);
      try {
        const fresh = this.cache.getFresh(playerId);
        if (fresh) return fresh;
      } catch {
        // A cache read failure must not prevent an online refresh.
      }
      const history = adaptMatchHistory(await this.client.get(
        '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=40',
        matchHistoryResponseSchema
      ), { scope: 'all', limit: 20 });
      const [rankResult, patchResult] = await Promise.allSettled([
        this.client.get(`/lol-ranked/v1/ranked-stats/${encodeURIComponent(playerId)}`, rankedStatsSchema),
        this.client.get('/lol-patch/v1/game-version', assetVersionSchema)
      ]);
      let rank: string | undefined;
      if (rankResult.status === 'fulfilled') {
        const solo = rankResult.value.queues.find((queue) => queue.queueType === 'RANKED_SOLO_5x5');
        if (solo && solo.tier.trim() && solo.tier.trim().toUpperCase() !== 'NA') {
          rank = [solo.tier.trim(), solo.division.trim(), `${solo.leaguePoints} LP`]
            .filter(Boolean)
            .join(' ');
        }
      }
      const wins = history.filter((match) => match.win).length;
      const kills = history.reduce((total, match) => total + match.kills, 0);
      const deaths = history.reduce((total, match) => total + match.deaths, 0);
      const assists = history.reduce((total, match) => total + match.assists, 0);
      const snapshot = personalHistorySchema.parse({
        playerId,
        displayName: summoner.displayName,
        profileIconId: summoner.profileIconId,
        ...(rank === undefined ? {} : { rank }),
        matches: history,
        sampleSize: history.length,
        wins,
        losses: history.length - wins,
        winRate: history.length ? wins / history.length : 0,
        averageKda: (kills + assists) / Math.max(1, deaths),
        favoriteChampions: favoriteChampions(history),
        ...(patchResult.status === 'fulfilled' ? { assetVersion: patchResult.value } : {}),
        cached: false,
        updatedAt: Date.now()
      });
      try {
        this.cache.put(snapshot);
      } catch {
        // A healthy LCU result remains usable when persistence is unavailable.
      }
      return snapshot;
    } catch {
      try {
        const cached = playerId === undefined ? this.cache.getLatest() : this.cache.getLatest(playerId);
        if (cached) return cached;
      } catch {
        // Cache failures are sanitized together with LCU failures.
      }
      throw unavailable();
    }
  }
}

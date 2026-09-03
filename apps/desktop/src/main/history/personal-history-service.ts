import { z } from 'zod';
import type { FavoriteChampion, PersonalHistorySnapshot } from '../../shared/domain';
import { formatRank } from '../../shared/rank';
import { personalHistorySchema, type PersonalHistoryTarget } from '../../shared/ipc';
import type { PersonalHistoryCache } from '../cache/database';
import type { LcuClient } from '../lcu/http-client';
import type { SgpClient } from '../sgp/sgp-client';
import { LcuStaticDataCache, type LcuStaticDataProvider } from '../lcu/static-data-cache';
import {
  adaptMatchHistory,
  matchHistoryGameSchema,
  matchHistoryResponseSchema
} from '../lcu/match-adapter';

const PERSONAL_HISTORY_DATA_VERSION = 7;

const currentSummonerSchema = z.object({
  summonerId: z.union([z.string(), z.number()]),
  displayName: z.string().optional(),
  gameName: z.string().optional(),
  tagLine: z.string().optional(),
  profileIconId: z.number().int().nonnegative(),
  puuid: z.string().min(1).optional()
});
const targetSummonerSchema = z.object({
  summonerId: z.union([z.string(), z.number()]).optional(),
  puuid: z.string().min(1).optional(),
  displayName: z.string().optional(),
  gameName: z.string().optional(),
  tagLine: z.string().optional(),
  profileIconId: z.number().int().nonnegative().optional()
}).passthrough();
const rankedStatsSchema = z.object({
  queues: z.array(z.object({
    queueType: z.string(), tier: z.string(), division: z.string(), leaguePoints: z.number().int()
  }))
});

function unavailable(): Error & { code: 'HISTORY_UNAVAILABLE' } {
  return Object.assign(new Error('Personal history is unavailable'), { code: 'HISTORY_UNAVAILABLE' as const });
}

function favoriteChampions(matches: PersonalHistorySnapshot['matches']): FavoriteChampion[] {
  const groups = new Map<number, {
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
  }>();
  for (const match of matches) {
    const group = groups.get(match.championId) ?? {
      games: 0, wins: 0, kills: 0, deaths: 0, assists: 0
    };
    group.games += 1;
    if (match.win) group.wins += 1;
    group.kills += match.kills;
    group.deaths += match.deaths;
    group.assists += match.assists;
    groups.set(match.championId, group);
  }
  return [...groups.entries()]
    .map(([championId, group]) => ({
      championId,
      games: group.games,
      wins: group.wins,
      winRate: group.wins / group.games,
      averageKills: group.kills / group.games,
      averageDeaths: group.deaths / group.games,
      averageAssists: group.assists / group.games
    }))
    .sort((left, right) => right.games - left.games || left.championId - right.championId);
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export class PersonalHistoryService {
  constructor(
    private readonly client: LcuClient,
    private readonly cache: Pick<PersonalHistoryCache, 'getFresh' | 'getLatest' | 'put'>,
    private readonly sgp?: SgpClient,
    private readonly staticData: LcuStaticDataProvider = new LcuStaticDataCache()
  ) {}

  async load(target?: PersonalHistoryTarget): Promise<PersonalHistorySnapshot> {
    let playerId = target?.playerId;
    try {
      let displayName: string;
      let profileIconId: number;
      let puuid = target?.puuid;
      if (target) {
        let resolved: z.infer<typeof targetSummonerSchema> | undefined;
        if (!target.displayName || target.profileIconId === undefined || !target.puuid) {
          try {
            const path = target.puuid
              ? `/lol-summoner/v2/summoners/puuid/${encodeURIComponent(target.puuid)}`
              : `/lol-summoner/v1/summoners/${encodeURIComponent(target.playerId)}`;
            resolved = targetSummonerSchema.parse(await this.client.get(path, targetSummonerSchema));
          } catch {
            resolved = undefined;
          }
        }
        puuid = puuid ?? resolved?.puuid;
        playerId = resolved?.summonerId === undefined ? target.playerId : String(resolved.summonerId);
        const gameName = resolved?.gameName?.trim();
        const tagLine = resolved?.tagLine?.trim();
        displayName = target.displayName
          ?? (gameName ? `${gameName}${tagLine ? `#${tagLine}` : ''}` : resolved?.displayName?.trim())
          ?? '未知玩家';
        profileIconId = target.profileIconId ?? resolved?.profileIconId ?? 0;
      } else {
        const summoner = currentSummonerSchema.parse(
          await this.client.get('/lol-summoner/v1/current-summoner', currentSummonerSchema)
        );
        playerId = String(summoner.summonerId);
        const gameName = summoner.gameName?.trim();
        const tagLine = summoner.tagLine?.trim();
        displayName = gameName
          ? `${gameName}${tagLine ? `#${tagLine}` : ''}`
          : summoner.displayName?.trim() || '我的战绩';
        profileIconId = summoner.profileIconId;
        puuid = summoner.puuid;
      }
      try {
        const fresh = this.cache.getFresh(playerId);
        const supportsRichMatchRows = fresh?.matches.every((match) => target
          ? match.allyPlayers !== undefined && match.enemyPlayers !== undefined
          : match.summonerSpellIds !== undefined &&
            match.allyChampionIds !== undefined &&
            match.enemyChampionIds !== undefined &&
            match.allyChampionIds.length + match.enemyChampionIds.length > 1);
        if (
          fresh?.historyDataVersion === PERSONAL_HISTORY_DATA_VERSION &&
          fresh.itemIconPaths !== undefined &&
          supportsRichMatchRows
        ) return fresh;
      } catch {
        // A cache read failure must not prevent an online refresh.
      }
      const rawHistory = target && puuid && this.sgp
        ? await this.sgp.getHistory(puuid, 40)
        : await this.client.get(
          target
            ? `/lol-match-history/v1/products/lol/${encodeURIComponent(puuid ?? playerId)}/matches?begIndex=0&endIndex=40`
            : '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=40',
          matchHistoryResponseSchema
        );
      const listedHistory = matchHistoryResponseSchema.parse(rawHistory);
      const listedGames = [...listedHistory.games]
        .sort((left, right) => right.gameCreation - left.gameCreation)
        .slice(0, 20);
      const enrichedGames = await mapLimit(listedGames, 4, async (game) => {
        const hasCompleteTeamMetrics = game.participants.length > 1 && game.participants.every((participant) =>
          participant.stats.totalDamageDealtToChampions !== undefined &&
          participant.stats.totalDamageTaken !== undefined &&
          participant.stats.goldEarned !== undefined
        );
        if (
          game.participants.length > 1 &&
          (game.participantIdentities?.length ?? 0) > 1 &&
          hasCompleteTeamMetrics
        ) return game;
        try {
          const detailedGame = await this.client.get(
            `/lol-match-history/v1/games/${encodeURIComponent(String(game.gameId))}`,
            matchHistoryGameSchema
          );
          const targetIdentity = detailedGame.participantIdentities?.find((identity) =>
            (puuid !== undefined && identity.player.puuid === puuid) ||
            (identity.player.summonerId !== undefined && String(identity.player.summonerId) === playerId)
          );
          const localParticipantId = targetIdentity?.participantId ?? game.participants[0]?.participantId;
          const localIndex = localParticipantId === undefined
            ? -1
            : detailedGame.participants.findIndex(
              (participant) => participant.participantId === localParticipantId
            );
          if (localIndex <= 0) return detailedGame;
          return {
            ...detailedGame,
            participants: [
              detailedGame.participants[localIndex],
              ...detailedGame.participants.filter((_, index) => index !== localIndex)
            ]
          };
        } catch {
          return game;
        }
      });
      const history = adaptMatchHistory({ games: enrichedGames }, { scope: 'all', limit: 20 });
      const rankRequest = target && puuid && this.sgp
        ? this.sgp.getRankedStats(puuid)
        : this.client.get(`/lol-ranked/v1/ranked-stats/${encodeURIComponent(playerId)}`, rankedStatsSchema);
      const [rankResult, patchResult, itemsResult] = await Promise.allSettled([
        rankRequest,
        this.staticData.getAssetVersion(this.client),
        this.staticData.getItemIconPaths(this.client)
      ]);
      let rank: string | undefined;
      if (rankResult.status === 'fulfilled') {
        const solo = rankResult.value.queues.find((queue) => queue.queueType === 'RANKED_SOLO_5x5');
        if (solo && solo.tier.trim() && solo.tier.trim().toUpperCase() !== 'NA') {
          rank = formatRank(solo.tier, solo.division, solo.leaguePoints);
        }
      }
      const wins = history.filter((match) => match.win).length;
      const kills = history.reduce((total, match) => total + match.kills, 0);
      const deaths = history.reduce((total, match) => total + match.deaths, 0);
      const assists = history.reduce((total, match) => total + match.assists, 0);
      const usedItemIds = new Set(history.flatMap((match) => match.itemIds ?? []));
      const itemIconPaths = Object.fromEntries(
        itemsResult.status === 'fulfilled'
          ? Object.entries(itemsResult.value)
            .filter(([itemId]) => usedItemIds.has(Number(itemId)))
          : []
      );
      const snapshot = personalHistorySchema.parse({
        playerId,
        displayName,
        profileIconId,
        ...(rank === undefined ? {} : { rank }),
        matches: history,
        sampleSize: history.length,
        wins,
        losses: history.length - wins,
        winRate: history.length ? wins / history.length : 0,
        averageKda: (kills + assists) / Math.max(1, deaths),
        favoriteChampions: favoriteChampions(history),
        ...(patchResult.status === 'fulfilled' ? { assetVersion: patchResult.value } : {}),
        itemIconPaths,
        historyDataVersion: PERSONAL_HISTORY_DATA_VERSION,
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

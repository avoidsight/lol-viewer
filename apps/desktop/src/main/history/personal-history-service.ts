import { z } from 'zod';
import { recordDiagnostic } from '../diagnostics/logger';
import { readHistorySource } from './history-source';
import { isTransientHistoryError, safeHistoryError } from '../../shared/history-error';
import type { FavoriteChampion, PersonalHistorySnapshot } from '../../shared/domain';
import { formatRank } from '../../shared/rank';
import { personalHistorySchema, personalMatchDetailSchema, type PersonalHistoryTarget, type PersonalMatchDetail } from '../../shared/ipc';
import { hasCompleteMatchDetails } from '../../shared/history-detail';
import type { PersonalHistoryCache } from '../cache/database';
import type { LcuClient } from '../lcu/http-client';
import type { SgpClient } from '../sgp/sgp-client';
import { LcuStaticDataCache, type LcuStaticDataProvider } from '../lcu/static-data-cache';
import { optionalWithin } from '../lcu/optional-data';
import {
  adaptMatchHistory,
  matchHistoryGameSchema,
  matchHistoryResponseSchema
} from '../lcu/match-adapter';

const PERSONAL_HISTORY_DATA_VERSION = 13;
const refreshRetryDelays = [250, 750] as const;

const currentSummonerSchema = z.object({
  summonerId: z.union([z.string(), z.number()]),
  displayName: z.string().optional().catch(undefined),
  gameName: z.string().optional().catch(undefined),
  tagLine: z.string().optional().catch(undefined),
  // 登录未完成或未设置头像时客户端会给负数或缺失，视为默认头像，而不是让整次读取失败。
  profileIconId: z.number().int().optional().catch(undefined),
  puuid: z.string().min(1).optional().catch(undefined)
});
const targetSummonerSchema = z.object({
  summonerId: z.union([z.string(), z.number()]).optional(),
  puuid: z.string().min(1).optional().catch(undefined),
  displayName: z.string().optional().catch(undefined),
  gameName: z.string().optional().catch(undefined),
  tagLine: z.string().optional().catch(undefined),
  profileIconId: z.number().int().nonnegative().optional().catch(undefined)
}).passthrough();
const rankedStatsSchema = z.object({
  queues: z.array(z.object({
    queueType: z.string(), tier: z.string(), division: z.string(), leaguePoints: z.number().int()
  }))
});

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

function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw Object.assign(new Error('History detail request cancelled'), { code: 'MATCH_CANCELLED' });
}

export class PersonalHistoryService {
  constructor(
    private readonly client: LcuClient,
    private readonly cache: Pick<PersonalHistoryCache, 'getFresh' | 'getLatest' | 'put'>,
    private readonly sgp?: SgpClient,
    private readonly staticData: LcuStaticDataProvider = new LcuStaticDataCache(),
    private readonly sleep: (milliseconds: number) => Promise<void> =
      (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
  ) {}

  // 手动刷新是用户主动操作，短暂抖动不应直接报错：对可能自行恢复的故障做有限重试。
  // 重试仍失败才抛出，由页面保留旧数据并提示原因。普通加载保持单次请求语义。
  async load(target?: PersonalHistoryTarget, forceRefresh = false): Promise<PersonalHistorySnapshot> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.loadOnce(target, forceRefresh);
      } catch (error) {
        if (!forceRefresh || attempt >= refreshRetryDelays.length || !isTransientHistoryError(error)) {
          throw error;
        }
        await this.sleep(refreshRetryDelays[attempt]);
      }
    }
  }

  async loadDetail(matchId: string, target: PersonalHistoryTarget, signal?: AbortSignal): Promise<PersonalMatchDetail> {
    try {
      checkCancelled(signal);
      let snapshot: PersonalHistorySnapshot | null = null;
      try { snapshot = this.cache.getLatest(target.playerId); } catch { /* Online details remain usable. */ }
      const listed = snapshot?.matches.find(match => match.matchId === matchId);
      if (listed && hasCompleteMatchDetails(listed)) return { match: listed, itemIconPaths: snapshot?.itemIconPaths ?? {} };
      const game = matchHistoryGameSchema.parse(await this.client.get(
        `/lol-match-history/v1/games/${encodeURIComponent(matchId)}`, matchHistoryGameSchema, signal
      ));
      checkCancelled(signal);
      if (String(game.gameId) !== matchId) throw new Error('LCU detail did not match its schema');
      const puuid = target.puuid ?? snapshot?.puuid;
      const identity = game.participantIdentities?.find(entry =>
        (puuid && entry.player.puuid === puuid) || String(entry.player.summonerId) === target.playerId);
      let index = identity ? game.participants.findIndex(p => p.participantId === identity.participantId) : -1;
      if (index < 0 && listed) {
        const candidates = game.participants.flatMap((p, i) => p.championId === listed.championId && p.stats.win === listed.win
          && p.stats.kills === listed.kills && p.stats.deaths === listed.deaths && p.stats.assists === listed.assists ? [i] : []);
        if (candidates.length === 1) index = candidates[0];
      }
      // The first participant in a detail response is not necessarily the viewed player.
      if (index < 0) throw new Error('Personal history is unavailable [HISTORY:NOT_READY]');
      const ordered = { ...game, participants: [game.participants[index], ...game.participants.filter((_, i) => i !== index)] };
      const match = adaptMatchHistory({ games: [ordered] }, { scope: 'all', limit: 10 })[0];
      const allIcons = await optionalWithin(this.staticData.getItemIconPaths(this.client));
      checkCancelled(signal);
      const itemIds = new Set([...(match.itemIds ?? []), ...[...(match.allyPlayers ?? []), ...(match.enemyPlayers ?? [])].flatMap(p => p.itemIds ?? [])]);
      const detail = personalMatchDetailSchema.parse({ match, itemIconPaths: { ...snapshot?.itemIconPaths,
        ...Object.fromEntries(Object.entries(allIcons ?? {}).filter(([id]) => itemIds.has(Number(id)))) } });
      // Do not let a late detail request replace a more recent manual refresh or extend list freshness.
      try {
        if (snapshot && this.cache.getLatest(target.playerId)?.updatedAt === snapshot.updatedAt)
          this.cache.put({ ...snapshot, matches: snapshot.matches.map(m => m.matchId === matchId ? match : m) }, snapshot.updatedAt);
      } catch { /* Best effort. */ }
      return detail;
    } catch (error) {
      if ((error as { code?: string } | null)?.code === 'MATCH_CANCELLED') throw error;
      recordDiagnostic('history.detail', error);
      throw safeHistoryError(error);
    }
  }

  private async loadOnce(target?: PersonalHistoryTarget, forceRefresh = false): Promise<PersonalHistorySnapshot> {
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
        profileIconId = Math.max(0, summoner.profileIconId ?? 0);
        puuid = summoner.puuid;
      }
      try {
        const fresh = forceRefresh ? null : this.cache.getFresh(playerId);
        if (
          fresh?.historyDataVersion === PERSONAL_HISTORY_DATA_VERSION &&
          fresh.itemIconPaths !== undefined
        ) return fresh;
      } catch {
        // A cache read failure must not prevent an online refresh.
      }
      const lookupId = puuid ?? playerId!;
      const lcuSource = { kind: 'lcu' as const, read: () => this.client.get(
          target
            ? `/lol-match-history/v1/products/lol/${encodeURIComponent(lookupId)}/matches?begIndex=0&endIndex=20`
            : '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=20',
          matchHistoryResponseSchema
        ) };
      const sgpSource = puuid && this.sgp ? { kind: 'sgp' as const, read: () => this.sgp!.getHistory(puuid!, 20) } : undefined;
      const rawHistory = await readHistorySource(target && sgpSource ? sgpSource : lcuSource, target && sgpSource ? lcuSource : sgpSource);
      const listedHistory = matchHistoryResponseSchema.parse(rawHistory);
      const listedGames = [...listedHistory.games]
        .sort((left, right) => right.gameCreation - left.gameCreation)
        .slice(0, 20);
      const history = adaptMatchHistory({ games: listedGames }, { scope: 'all', limit: 20 });
      const rankRequest = target && puuid && this.sgp
        ? this.sgp.getRankedStats(puuid)
        : this.client.get(`/lol-ranked/v1/ranked-stats/${encodeURIComponent(playerId)}`, rankedStatsSchema);
      const [rankResult, patchResult, itemsResult] = await Promise.allSettled([
        optionalWithin(rankRequest),
        optionalWithin(this.staticData.getAssetVersion(this.client)),
        optionalWithin(this.staticData.getItemIconPaths(this.client))
      ]);
      let rank: string | undefined;
      if (rankResult.status === 'fulfilled' && rankResult.value) {
        const solo = rankResult.value.queues.find((queue) => queue.queueType === 'RANKED_SOLO_5x5');
        if (solo && solo.tier.trim() && solo.tier.trim().toUpperCase() !== 'NA') {
          rank = formatRank(solo.tier, solo.division, solo.leaguePoints);
        }
      }
      const wins = history.filter((match) => match.win).length;
      const kills = history.reduce((total, match) => total + match.kills, 0);
      const deaths = history.reduce((total, match) => total + match.deaths, 0);
      const assists = history.reduce((total, match) => total + match.assists, 0);
      const usedItemIds = new Set(history.flatMap((match) => [...(match.itemIds ?? []), ...[...(match.allyPlayers ?? []), ...(match.enemyPlayers ?? [])].flatMap(player => player.itemIds ?? [])]));
      const itemIconPaths = Object.fromEntries(
        itemsResult.status === 'fulfilled' && itemsResult.value
          ? Object.entries(itemsResult.value)
            .filter(([itemId]) => usedItemIds.has(Number(itemId)))
          : []
      );
      const snapshot = personalHistorySchema.parse({
        playerId,
        ...(puuid ? { puuid } : {}),
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
        ...(patchResult.status === 'fulfilled' && patchResult.value ? { assetVersion: patchResult.value } : {}),
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
    } catch (error) {
      recordDiagnostic('history.load', error);
      try {
        const cached = playerId === undefined ? null : this.cache.getLatest(playerId);
        if (cached && !forceRefresh) return cached;
      } catch {
        // Cache failures are sanitized together with LCU failures.
      }
      throw safeHistoryError(error);
    }
  }
}

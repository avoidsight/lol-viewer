import { z } from 'zod';
import type { Lane, MatchSummary, PlayerSnapshot, QueueScope } from '../../shared/domain';
import type { LiveMatch } from '../../shared/ipc';
import type { LcuClient, LcuError } from '../lcu/http-client';
import { adaptMatchHistory } from '../lcu/match-adapter';

const participantSchema = z.object({
  summonerId: z.union([z.string(), z.number()]),
  summonerName: z.string(),
  teamId: z.number().int(),
  selectedPosition: z.string().optional(),
  championId: z.number().int().nonnegative()
});

const sessionSchema = z.object({
  gameData: z.object({
    teamOne: z.array(participantSchema).length(5),
    teamTwo: z.array(participantSchema).length(5),
    queue: z.object({ id: z.number().int().nonnegative() }).optional(),
    queueId: z.number().int().nonnegative().optional()
  }).refine((gameData) => gameData.queue !== undefined || gameData.queueId !== undefined, {
    message: 'Live session queue metadata is required'
  })
});

const currentSummonerSchema = z.object({ summonerId: z.union([z.string(), z.number()]) });
const rankedStatsSchema = z.object({
  queues: z.array(z.object({
    queueType: z.string(), tier: z.string(), division: z.string(), leaguePoints: z.number().int()
  }))
});

const matchHistorySchema = z.object({ games: z.array(z.unknown()) });
const assetVersionSchema = z.string().regex(/^\d+\.\d+(?:\.\d+){0,2}$/);
const retryDelays = [250, 750] as const;
const lanes = new Set<Lane>(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'UNKNOWN']);
const standardPositions = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);

export interface MatchServiceOptions {
  sleep?: (milliseconds: number) => Promise<void>;
  cache?: MatchSnapshotCache;
}

export interface MatchSnapshotCache {
  get(playerId: string, scope: QueueScope): PlayerSnapshot | null;
  put(snapshot: PlayerSnapshot): void;
}

function laneOf(value: string | undefined): Lane {
  return value && lanes.has(value as Lane) ? (value as Lane) : 'UNKNOWN';
}

function isTransient(error: unknown): boolean {
  return (error as Partial<LcuError>)?.code === 'LCU_UNAVAILABLE';
}

function modeNameOf(queueId: number): string {
  if (queueId === 420) return '单双排';
  if (queueId === 440) return '灵活排位';
  if (queueId === 400 || queueId === 430) return '匹配模式';
  if (queueId === 450) return '极地大乱斗';
  return '其他模式';
}

function hasReliablePositions(team: z.infer<typeof participantSchema>[]): boolean {
  const positions = team.map((participant) => participant.selectedPosition);
  return positions.every((position): position is string => position !== undefined && standardPositions.has(position))
    && new Set(positions).size === standardPositions.size;
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export class MatchService {
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly cache: MatchSnapshotCache | undefined;

  constructor(private readonly client: LcuClient, options: MatchServiceOptions = {}) {
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.cache = options.cache;
  }

  async loadLiveMatch(scope: QueueScope, onPlayer: (player: PlayerSnapshot) => void): Promise<LiveMatch> {
    const session = sessionSchema.parse(
      await this.client.get('/lol-gameflow/v1/session', sessionSchema)
    );
    const queueId = session.gameData.queue?.id ?? session.gameData.queueId!;
    const modeName = modeNameOf(queueId);
    const positionOrderReliable = queueId !== 450
      && hasReliablePositions(session.gameData.teamOne)
      && hasReliablePositions(session.gameData.teamTwo);
    let currentSummoner: z.infer<typeof currentSummonerSchema> | undefined;
    try {
      currentSummoner = currentSummonerSchema.parse(
        await this.client.get('/lol-summoner/v1/current-summoner', currentSummonerSchema)
      );
    } catch {
      currentSummoner = undefined;
    }
    let assetVersion: string | undefined;
    try {
      assetVersion = assetVersionSchema.parse(
        await this.client.get('/lol-patch/v1/game-version', assetVersionSchema)
      );
    } catch {
      assetVersion = undefined;
    }
    const allParticipants = [...session.gameData.teamOne, ...session.gameData.teamTwo];
    const local = currentSummoner
      ? allParticipants.find((participant) => String(participant.summonerId) === String(currentSummoner.summonerId))
      : undefined;
    if (currentSummoner && !local) throw new Error('Current summoner is not part of the live session');
    const localTeamId = local?.teamId ?? null;
    const participants = local ? [
      ...allParticipants.filter((participant) => participant.teamId === localTeamId),
      ...allParticipants.filter((participant) => participant.teamId !== localTeamId)
    ] : allParticipants;
    const players = await mapLimit(participants, 4, async (participant) => {
      const base = {
        playerId: String(participant.summonerId),
        displayName: participant.summonerName,
        teamId: participant.teamId,
        ...(localTeamId === null ? {} : { isLocalTeam: participant.teamId === localTeamId }),
        lane: laneOf(participant.selectedPosition),
        championId: participant.championId,
        ...(assetVersion === undefined ? {} : { assetVersion }),
        scope,
        updatedAt: Date.now()
      };
      let cached: PlayerSnapshot | null = null;
      try {
        cached = this.cache?.get(base.playerId, scope) ?? null;
      } catch {
        // Cache availability must not affect live LCU history loading.
      }
      let matches: MatchSummary[] | null = cached?.matches ?? null;
      let rank: string | undefined;
      try {
        const ranked = rankedStatsSchema.parse(await this.client.get(
          `/lol-ranked/v1/ranked-stats/${encodeURIComponent(base.playerId)}`, rankedStatsSchema
        ));
        const solo = ranked.queues.find((queue) => queue.queueType === 'RANKED_SOLO_5x5');
        if (solo) rank = `${solo.tier} ${solo.division} ${solo.leaguePoints} LP`;
      } catch {
        rank = undefined;
      }
      if (!cached) {
        try {
          const rawHistory = await this.getHistoryWithRetry(base.playerId);
          matches = adaptMatchHistory(rawHistory, scope);
        } catch {
          matches = null;
        }
      }
      const recentMatches = matches ?? [];
      const wins = recentMatches.filter((match) => match.win).length;
      const championMatches = recentMatches.filter((match) => match.championId === base.championId);
      const currentChampionWins = championMatches.filter((match) => match.win).length;
      const player: PlayerSnapshot = {
        ...base,
        ...(rank === undefined ? {} : { rank }),
        matches: recentMatches,
        sampleSize: recentMatches.length,
        wins,
        losses: recentMatches.length - wins,
        winRate: recentMatches.length ? wins / recentMatches.length : 0,
        currentChampionGames: championMatches.length,
        currentChampionWins,
        currentChampionWinRate: championMatches.length ? currentChampionWins / championMatches.length : 0,
        status: matches === null ? 'unavailable' : 'ready',
        ...(matches === null ? { error: 'Player history is unavailable' } : {})
      };
      if (player.status === 'ready' && !cached) {
        try {
          this.cache?.put(player);
        } catch {
          // Persisting a fresh snapshot is best-effort.
        }
      }
      try {
        onPlayer(player);
      } catch {
        // A stale or faulty renderer listener must not affect match loading.
      }
      return player;
    });
    return { players, localTeamId, queueId, modeName, positionOrderReliable };
  }

  private async getHistoryWithRetry(playerId: string): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.client.get(
          `/lol-match-history/v1/products/lol/${encodeURIComponent(playerId)}/matches?begIndex=0&endIndex=20`,
          matchHistorySchema
        );
      } catch (error) {
        if (!isTransient(error) || attempt >= retryDelays.length) throw error;
        await this.sleep(retryDelays[attempt]);
      }
    }
  }
}

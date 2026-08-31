import { z } from 'zod';
import type { Lane, MatchSummary, PlayerSnapshot, QueueScope } from '../../shared/domain';
import type { LiveMatch } from '../../shared/ipc';
import { formatRank } from '../../shared/rank';
import type { LcuClient, LcuError } from '../lcu/http-client';
import { adaptMatchHistory, describeQueue } from '../lcu/match-adapter';
import type { SgpClient } from '../sgp/sgp-client';

const participantSchema = z.object({
  summonerId: z.union([z.string(), z.number()]),
  summonerName: z.string(),
  teamId: z.number().int().optional(),
  selectedPosition: z.string().optional(),
  championId: z.number().int().nonnegative(),
  isLocalPlayer: z.boolean().optional(),
  puuid: z.string().optional()
});

const gameflowTeamSchema = z.array(participantSchema).refine(
  (team) => team.length === 0 || team.length === 4 || team.length === 5,
  'Gameflow team must be empty or contain four or five players'
);

const championSelectionSchema = z.object({
  puuid: z.string(),
  championId: z.number().int().nonnegative()
});

const sessionSchema = z.object({
  phase: z.string().optional(),
  gameData: z.object({
    teamOne: gameflowTeamSchema,
    teamTwo: gameflowTeamSchema,
    queue: z.object({ id: z.number().int().nonnegative() }).optional(),
    queueId: z.number().int().nonnegative().optional(),
    playerChampionSelections: z.array(championSelectionSchema).optional()
  })
});

const champSelectParticipantSchema = z.object({
  cellId: z.number().int().optional(),
  summonerId: z.union([z.string(), z.number()]),
  championId: z.number().int().nonnegative(),
  assignedPosition: z.string().optional(),
  gameName: z.string().optional(),
  playerAlias: z.string().optional()
});

const champSelectSessionSchema = z.object({
  myTeam: z.array(champSelectParticipantSchema).length(5),
  theirTeam: z.array(champSelectParticipantSchema).length(5),
  queueId: z.number().int().nonnegative().optional(),
  localPlayerCellId: z.number().int().optional()
});

const currentSummonerSchema = z.object({ summonerId: z.union([z.string(), z.number()]), displayName: z.string().optional(), puuid: z.string().optional() });
const rankedStatsSchema = z.object({
  queues: z.array(z.object({
    queueType: z.string(), tier: z.string(), division: z.string(), leaguePoints: z.number().int()
  }))
});
const summonerIdentitySchema = z.object({
  gameName: z.string().optional(),
  tagLine: z.string().optional(),
  displayName: z.string().optional(),
  puuid: z.string().optional()
});

const matchHistorySchema = z.object({ games: z.array(z.unknown()) });
const assetVersionSchema = z.string().regex(/^\d+\.\d+(?:\.\d+){0,2}$/);
const retryDelays = [250, 750] as const;
const lanes = new Set<Lane>(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'UNKNOWN']);
const standardPositions = new Set(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);

export interface MatchServiceOptions {
  sleep?: (milliseconds: number) => Promise<void>;
  cache?: MatchSnapshotCache;
  sgp?: SgpClient;
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

interface MatchCancelledError extends Error { code: 'MATCH_CANCELLED' }
function cancelled(): MatchCancelledError {
  return Object.assign(new Error('Live match request cancelled'), { code: 'MATCH_CANCELLED' as const });
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw cancelled();
}

function hasReliablePositions(team: z.infer<typeof participantSchema>[]): boolean {
  const positions = team.map((participant) => participant.selectedPosition);
  return positions.every((position): position is string => position !== undefined && standardPositions.has(position))
    && new Set(positions).size === standardPositions.size;
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>, signal?: AbortSignal): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      checkCancelled(signal);
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
  private readonly sgp: SgpClient | undefined;

  constructor(private readonly client: LcuClient, options: MatchServiceOptions = {}) {
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.cache = options.cache;
    this.sgp = options.sgp;
  }

  async loadLiveMatch(_scope: QueueScope, onPlayer: (player: PlayerSnapshot) => void, signal?: AbortSignal): Promise<LiveMatch> {
    checkCancelled(signal);
    const gameflowSession = sessionSchema.parse(
      await this.client.get('/lol-gameflow/v1/session', sessionSchema)
    );
    checkCancelled(signal);
    let teamOne = gameflowSession.gameData.teamOne.map((participant) => ({ ...participant, teamId: participant.teamId ?? 100 }));
    let teamTwo = gameflowSession.gameData.teamTwo.map((participant) => ({ ...participant, teamId: participant.teamId ?? 200 }));
    let champSelectFallback = false;
    let champSelectQueueId: number | undefined;
    if (gameflowSession.phase === 'ChampSelect' || (teamOne.length === 0 && teamTwo.length === 0)) {
      const champSelect = champSelectSessionSchema.parse(
        await this.client.get('/lol-champ-select/v1/session', champSelectSessionSchema)
      );
      checkCancelled(signal);
      const normalizeTeam = (
        team: z.infer<typeof champSelectParticipantSchema>[],
        teamId: number,
        sideName: string
      ): Array<z.infer<typeof participantSchema> & { teamId: number }> => team.map((participant, index) => ({
        summonerId: participant.summonerId,
        summonerName: participant.gameName || participant.playerAlias || `${sideName}玩家 ${index + 1}`,
        teamId,
        selectedPosition: participant.assignedPosition,
        championId: participant.championId,
        ...(participant.cellId !== undefined && participant.cellId === champSelect.localPlayerCellId ? { isLocalPlayer: true } : {})
      }));
      teamOne = normalizeTeam(champSelect.myTeam, 100, '己方');
      teamTwo = normalizeTeam(champSelect.theirTeam, 200, '敌方');
      champSelectQueueId = champSelect.queueId;
      champSelectFallback = true;
    }
    const queueId = gameflowSession.gameData.queue?.id
      ?? gameflowSession.gameData.queueId
      ?? champSelectQueueId
      ?? 0;
    const modeName = describeQueue(queueId);
    let positionOrderReliable = false;
    let currentSummoner: z.infer<typeof currentSummonerSchema> | undefined;
    try {
      currentSummoner = currentSummonerSchema.parse(
        await this.client.get('/lol-summoner/v1/current-summoner', currentSummonerSchema)
      );
    } catch {
      checkCancelled(signal);
      currentSummoner = undefined;
    }
    if (!champSelectFallback && currentSummoner?.puuid && teamOne.length + teamTwo.length === 9) {
      const selection = gameflowSession.gameData.playerChampionSelections?.find(
        (entry) => entry.puuid === currentSummoner?.puuid
      );
      const incompleteTeam = teamOne.length === 4 ? teamOne : teamTwo.length === 4 ? teamTwo : undefined;
      const teamId = teamOne.length === 4 ? 100 : teamTwo.length === 4 ? 200 : undefined;
      if (selection && incompleteTeam && teamId !== undefined) {
        incompleteTeam.push({
          summonerId: currentSummoner.summonerId,
          summonerName: currentSummoner.displayName ?? '我的账号',
          teamId,
          championId: selection.championId,
          isLocalPlayer: true
        });
      }
    }
    if (teamOne.length !== 5 || teamTwo.length !== 5) {
      throw new Error('Live roster is incomplete');
    }
    positionOrderReliable = queueId !== 0 && queueId !== 450
      && hasReliablePositions(teamOne)
      && hasReliablePositions(teamTwo);
    checkCancelled(signal);
    let assetVersion: string | undefined;
    try {
      assetVersion = assetVersionSchema.parse(
        await this.client.get('/lol-patch/v1/game-version', assetVersionSchema)
      );
    } catch {
      checkCancelled(signal);
      assetVersion = undefined;
    }
    checkCancelled(signal);
    const allParticipants = [...teamOne, ...teamTwo];
    const local = allParticipants.find((participant) => participant.isLocalPlayer)
      ?? (currentSummoner ? allParticipants.find((participant) => String(participant.summonerId) === String(currentSummoner.summonerId)) : undefined);
    const localTeamId = local?.teamId ?? (champSelectFallback ? 100 : null);
    const participants = local ? [
      ...allParticipants.filter((participant) => participant.teamId === localTeamId),
      ...allParticipants.filter((participant) => participant.teamId !== localTeamId)
    ] : allParticipants;
    const players = await mapLimit(participants, 4, async (participant) => {
      checkCancelled(signal);
      const isLocalPlayer = participant === local;
      let displayName = isLocalPlayer && currentSummoner?.displayName
        ? currentSummoner.displayName
        : participant.summonerName.trim();
      let playerPuuid = participant.puuid
        ?? (isLocalPlayer ? currentSummoner?.puuid : undefined);
      if (!displayName || !playerPuuid) {
        try {
          const identity = summonerIdentitySchema.parse(await this.client.get(
            `/lol-summoner/v1/summoners/${encodeURIComponent(String(participant.summonerId))}`,
            summonerIdentitySchema
          ));
          playerPuuid = playerPuuid ?? identity.puuid;
          if (!displayName) {
            const gameName = identity.gameName?.trim();
            const tagLine = identity.tagLine?.trim();
            displayName = gameName ? `${gameName}${tagLine ? `#${tagLine}` : ''}` : identity.displayName?.trim() ?? '';
          }
        } catch {
          checkCancelled(signal);
        }
      }
      const lookupId = playerPuuid ?? String(participant.summonerId);
      const base = {
        playerId: String(isLocalPlayer && currentSummoner ? currentSummoner.summonerId : participant.summonerId),
        displayName: displayName || '未知玩家',
        teamId: participant.teamId,
        ...(localTeamId === null ? {} : { isLocalTeam: participant.teamId === localTeamId }),
        lane: laneOf(participant.selectedPosition),
        championId: participant.championId,
        ...(assetVersion === undefined ? {} : { assetVersion }),
        scope: 'all' as const,
        updatedAt: Date.now()
      };
      let cached: PlayerSnapshot | null = null;
      try {
        cached = this.cache?.get(base.playerId, 'all') ?? null;
      } catch {
        // Cache availability must not affect live LCU history loading.
      }
      checkCancelled(signal);
      let matches: MatchSummary[] | null = cached?.matches ?? null;
      let rank: string | undefined;
      try {
        const ranked = rankedStatsSchema.parse(playerPuuid && this.sgp
          ? await this.sgp.getRankedStats(playerPuuid)
          : await this.client.get(
            `/lol-ranked/v1/ranked-stats/${encodeURIComponent(lookupId)}`, rankedStatsSchema
          ));
        const rankQueueType = queueId === 440 ? 'RANKED_FLEX_SR' : 'RANKED_SOLO_5x5';
        const selectedRank = ranked.queues.find((queue) => queue.queueType === rankQueueType);
        if (selectedRank) rank = formatRank(selectedRank.tier, selectedRank.division, selectedRank.leaguePoints);
      } catch {
        checkCancelled(signal);
        rank = undefined;
      }
      checkCancelled(signal);
      if (!cached) {
        try {
          let rawHistory: unknown;
          if (playerPuuid && this.sgp) {
            try {
              rawHistory = await this.sgp.getHistory(playerPuuid, 20);
            } catch (error) {
              if (!isLocalPlayer) throw error;
              rawHistory = await this.getHistoryWithRetry(lookupId, true, signal);
            }
          } else {
            rawHistory = await this.getHistoryWithRetry(
              lookupId,
              isLocalPlayer && (champSelectFallback || participant.isLocalPlayer === true),
              signal
            );
          }
          matches = adaptMatchHistory(rawHistory, { scope: 'all', limit: 10 });
        } catch {
          checkCancelled(signal);
          matches = null;
        }
      }
      checkCancelled(signal);
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
        checkCancelled(signal);
        try {
          this.cache?.put(player);
        } catch {
          // Persisting a fresh snapshot is best-effort.
        }
      }
      checkCancelled(signal);
      try {
        onPlayer(player);
      } catch {
        // A stale or faulty renderer listener must not affect match loading.
      }
      return player;
    }, signal);
    checkCancelled(signal);
    return { players, localTeamId, queueId, modeName, positionOrderReliable };
  }

  private async getHistoryWithRetry(playerId: string, useCurrentSummonerRoute = false, signal?: AbortSignal): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      checkCancelled(signal);
      try {
        const result = await this.client.get(
          useCurrentSummonerRoute
            ? '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=20'
            : `/lol-match-history/v1/products/lol/${encodeURIComponent(playerId)}/matches?begIndex=0&endIndex=20`,
          matchHistorySchema
        );
        checkCancelled(signal);
        return result;
      } catch (error) {
        checkCancelled(signal);
        if (!isTransient(error) || attempt >= retryDelays.length) throw error;
        await this.sleep(retryDelays[attempt]);
        checkCancelled(signal);
      }
    }
  }
}

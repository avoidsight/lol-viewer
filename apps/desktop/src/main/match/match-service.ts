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
    teamTwo: z.array(participantSchema).length(5)
  })
});

const matchHistorySchema = z.object({ games: z.array(z.unknown()) });
const retryDelays = [250, 750] as const;
const lanes = new Set<Lane>(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'UNKNOWN']);

export interface MatchServiceOptions {
  sleep?: (milliseconds: number) => Promise<void>;
}

function laneOf(value: string | undefined): Lane {
  return value && lanes.has(value as Lane) ? (value as Lane) : 'UNKNOWN';
}

function isTransient(error: unknown): boolean {
  return (error as Partial<LcuError>)?.code === 'LCU_UNAVAILABLE';
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

  constructor(private readonly client: LcuClient, options: MatchServiceOptions = {}) {
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async loadLiveMatch(scope: QueueScope, onPlayer: (player: PlayerSnapshot) => void): Promise<LiveMatch> {
    const session = sessionSchema.parse(
      await this.client.get('/lol-gameflow/v1/session', sessionSchema)
    );
    const participants = [...session.gameData.teamOne, ...session.gameData.teamTwo];
    const players = await mapLimit(participants, 4, async (participant) => {
      const base = {
        playerId: String(participant.summonerId),
        displayName: participant.summonerName,
        teamId: participant.teamId,
        lane: laneOf(participant.selectedPosition),
        championId: participant.championId,
        scope,
        updatedAt: Date.now()
      };
      let matches: MatchSummary[] | null;
      try {
        const rawHistory = await this.getHistoryWithRetry(base.playerId);
        matches = adaptMatchHistory(rawHistory, scope);
      } catch {
        matches = null;
      }
      const recentMatches = matches ?? [];
      const wins = recentMatches.filter((match) => match.win).length;
      const championMatches = recentMatches.filter((match) => match.championId === base.championId);
      const currentChampionWins = championMatches.filter((match) => match.win).length;
      const player: PlayerSnapshot = {
        ...base,
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
      try {
        onPlayer(player);
      } catch {
        // A stale or faulty renderer listener must not affect match loading.
      }
      return player;
    });
    return { players };
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

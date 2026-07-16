import { z } from 'zod';
import type { Lane, PlayerSnapshot, QueueScope } from '../../shared/domain';
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
    teamOne: z.array(participantSchema),
    teamTwo: z.array(participantSchema)
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
    const session = await this.client.get('/lol-gameflow/v1/session', sessionSchema);
    const participants = [...session.gameData.teamOne, ...session.gameData.teamTwo].slice(0, 10);
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
      let rawHistory: unknown;
      try {
        rawHistory = await this.getHistoryWithRetry(base.playerId);
        const matches = adaptMatchHistory(rawHistory, scope);
        const wins = matches.filter((match) => match.win).length;
        const championMatches = matches.filter((match) => match.championId === base.championId);
        const currentChampionWins = championMatches.filter((match) => match.win).length;
        const player: PlayerSnapshot = {
          ...base,
          matches,
          sampleSize: matches.length,
          wins,
          losses: matches.length - wins,
          winRate: matches.length ? wins / matches.length : 0,
          currentChampionGames: championMatches.length,
          currentChampionWins,
          currentChampionWinRate: championMatches.length ? currentChampionWins / championMatches.length : 0,
          status: 'ready'
        };
        onPlayer(player);
        return player;
      } catch {
        const player: PlayerSnapshot = {
          ...base,
          matches: [],
          sampleSize: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          currentChampionGames: 0,
          currentChampionWins: 0,
          currentChampionWinRate: 0,
          status: 'unavailable',
          error: 'Player history is unavailable'
        };
        onPlayer(player);
        return player;
      }
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

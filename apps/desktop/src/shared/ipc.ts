import { z } from 'zod';
import type { PlayerSnapshot, QueueScope } from './domain';

export const MATCH_GET_CHANNEL = 'match:get-live' as const;
export const PLAYER_UPDATED_CHANNEL = 'match:player-updated' as const;

const laneSchema = z.enum(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'UNKNOWN']);
const queueScopeSchema = z.enum(['ranked-solo', 'all']);
const matchSummarySchema = z.object({
  matchId: z.string(),
  queueId: z.number().int(),
  endedAt: z.number(),
  durationSeconds: z.number(),
  championId: z.number().int().nonnegative(),
  win: z.boolean(),
  kills: z.number().int().nonnegative(),
  deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(),
  cs: z.number().optional(),
  lane: laneSchema.optional()
});

export const playerSnapshotSchema: z.ZodType<PlayerSnapshot> = z.object({
  playerId: z.string(),
  displayName: z.string(),
  teamId: z.number().int(),
  lane: laneSchema,
  championId: z.number().int().nonnegative(),
  assetVersion: z.string().min(1).optional(),
  rank: z.string().optional(),
  scope: queueScopeSchema,
  matches: z.array(matchSummarySchema),
  sampleSize: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  winRate: z.number(),
  currentChampionGames: z.number().int().nonnegative(),
  currentChampionWins: z.number().int().nonnegative(),
  currentChampionWinRate: z.number(),
  status: z.enum(['loading', 'ready', 'unavailable']),
  error: z.string().optional(),
  updatedAt: z.number()
});

export const liveMatchSchema = z.object({ players: z.array(playerSnapshotSchema).length(10) });

export interface LiveMatch {
  players: PlayerSnapshot[];
}

export interface LolViewerApi {
  getLiveMatch(scope: QueueScope): Promise<LiveMatch>;
  onPlayerUpdated(listener: (player: PlayerSnapshot) => void): () => void;
}

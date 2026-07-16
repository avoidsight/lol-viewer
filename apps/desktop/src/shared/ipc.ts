import { z } from 'zod';
import type { PlayerSnapshot, QueueScope } from './domain';

export const MATCH_GET_CHANNEL = 'match:get-live' as const;
export const PLAYER_UPDATED_CHANNEL = 'match:player-updated' as const;
export const SETTINGS_GET_CHANNEL = 'settings:get' as const;
export const SETTINGS_UPDATE_CHANNEL = 'settings:update' as const;
export const SETTINGS_CLEAR_CACHE_CHANNEL = 'settings:clear-cache' as const;

const laneSchema = z.enum(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'UNKNOWN']);
export const queueScopeSchema = z.enum(['ranked-solo', 'all']);
export const appSettingsSchema = z.object({
  queueScope: queueScopeSchema,
  autoOpenLiveMatch: z.boolean(),
  showLaneDifferences: z.boolean()
}).strict();
export const appSettingsPatchSchema = appSettingsSchema.partial().strict();
export type AppSettings = z.infer<typeof appSettingsSchema>;
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
}).strict();

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
}).strict();

export const liveMatchSchema = z.object({ players: z.array(playerSnapshotSchema).length(10) }).strict();

export interface LiveMatch {
  players: PlayerSnapshot[];
}

export interface LolViewerApi {
  getLiveMatch(scope: QueueScope): Promise<LiveMatch>;
  onPlayerUpdated(listener: (player: PlayerSnapshot) => void): () => void;
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  clearCache(): Promise<void>;
}

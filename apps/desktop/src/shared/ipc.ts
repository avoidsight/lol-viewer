import { z } from 'zod';
import type { PlayerSnapshot, QueueScope } from './domain';

export const MATCH_GET_CHANNEL = 'match:get-live' as const;
export const MATCH_RETRY_CHANNEL = 'match:retry' as const;
export const PLAYER_UPDATED_CHANNEL = 'match:player-updated' as const;
export const SETTINGS_GET_CHANNEL = 'settings:get' as const;
export const SETTINGS_UPDATE_CHANNEL = 'settings:update' as const;
export const SETTINGS_CLEAR_CACHE_CHANNEL = 'settings:clear-cache' as const;
export const CHAMPION_GUIDE_GET_CHANNEL = 'champions:get-guide' as const;

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
export const liveMatchRequestSchema = z.object({ scope: queueScopeSchema, generation: z.number().int().nonnegative() }).strict();
export const playerUpdateSchema = z.object({ generation: z.number().int().nonnegative(), player: playerSnapshotSchema }).strict();

export const championLaneSchema = z.enum(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
export const championGuideSnapshotSchema = z.object({
  championId: z.number().int().positive(), lane: championLaneSchema,
  patch: z.string().regex(/^\d+\.\d+$/), source: z.enum(['CN_OFFICIAL', 'OPGG', 'MANUAL']),
  region: z.string().min(2), tier: z.string().min(1), fetchedAt: z.string().datetime(),
  builds: z.array(z.object({ itemIds: z.array(z.number().int().positive()).min(2), pickRate: z.number().min(0).max(1).optional() }).strict()),
  favorable: z.array(z.object({ opponentChampionId: z.number().int().positive(), winRate: z.number().min(0).max(1), games: z.number().int().nonnegative().optional() }).strict()),
  unfavorable: z.array(z.object({ opponentChampionId: z.number().int().positive(), winRate: z.number().min(0).max(1), games: z.number().int().nonnegative().optional() }).strict()),
  notes: z.array(z.string().max(240)).max(5)
}).strict();
export const championGuideSchema = championGuideSnapshotSchema.extend({ stale: z.boolean() }).strict();
export const championGuideRequestSchema = z.object({ championId: z.number().int().positive(), lane: championLaneSchema }).strict();
export type ChampionLane = z.infer<typeof championLaneSchema>;
export type ChampionGuideSnapshot = z.infer<typeof championGuideSnapshotSchema>;
export type ChampionGuide = z.infer<typeof championGuideSchema>;

export interface LiveMatch {
  players: PlayerSnapshot[];
}

export interface LolViewerApi {
  getLiveMatch(scope: QueueScope, generation?: number): Promise<LiveMatch>;
  retryLiveMatch?(): Promise<void>;
  onPlayerUpdated(listener: (player: PlayerSnapshot, generation?: number) => void): () => void;
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  clearCache(): Promise<void>;
  getChampionGuide(championId: number, lane: ChampionLane): Promise<ChampionGuide>;
}

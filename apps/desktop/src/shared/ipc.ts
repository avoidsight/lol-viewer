import { z } from 'zod';
import type { PersonalHistorySnapshot, PlayerSnapshot, QueueScope } from './domain';

export const MATCH_GET_CHANNEL = 'match:get-live' as const;
export const MATCH_ROSTER_GET_CHANNEL = 'match:get-roster' as const;
export const MATCH_RETRY_CHANNEL = 'match:retry' as const;
export const MATCH_CANCEL_CHANNEL = 'match:cancel' as const;
export const GAMEFLOW_PHASE_GET_CHANNEL = 'gameflow:get-phase' as const;
export const GAMEFLOW_SESSION_GET_CHANNEL = 'gameflow:get-session-identity' as const;
export const PLAYER_UPDATED_CHANNEL = 'match:player-updated' as const;
export const SETTINGS_GET_CHANNEL = 'settings:get' as const;
export const SETTINGS_UPDATE_CHANNEL = 'settings:update' as const;
export const SETTINGS_CLEAR_CACHE_CHANNEL = 'settings:clear-cache' as const;
export const CHAMPION_GUIDE_GET_CHANNEL = 'champions:get-guide' as const;
export const CHAMPION_CATALOG_GET_CHANNEL = 'champions:get-catalog' as const;
export const CHAMPION_DETAILS_GET_CHANNEL = 'champions:get-details' as const;
export const PERSONAL_HISTORY_GET_CHANNEL = 'history:get-personal' as const;

const laneSchema = z.enum(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY', 'UNKNOWN']);
const matchAchievementSchema = z.object({
  type: z.enum(['MOST_KILLS', 'MOST_ASSISTS', 'MOST_DEATHS', 'MOST_DAMAGE', 'MOST_DAMAGE_TAKEN', 'MOST_GOLD', 'MOST_CS']),
  value: z.number().nonnegative()
}).strict();
const matchParticipantSummarySchema = z.object({
  championId: z.number().int().nonnegative(),
  playerId: z.string().min(1).optional(),
  puuid: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  profileIconId: z.number().int().nonnegative().optional()
}).strict();
export const queueScopeSchema = z.enum(['ranked-solo', 'all']);
export const appSettingsSchema = z.object({
  autoOpenLiveMatch: z.boolean(),
  showLaneDifferences: z.boolean(),
  autoAcceptReadyCheck: z.boolean()
}).strict();
export const appSettingsPatchSchema = appSettingsSchema.partial().strict();
export type AppSettings = z.infer<typeof appSettingsSchema>;
export const matchSummarySchema = z.object({
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
  lane: laneSchema.optional(),
  itemIds: z.array(z.number().int().positive()).max(7).optional(),
  summonerSpellIds: z.tuple([
    z.number().int().positive(),
    z.number().int().positive()
  ]).optional(),
  allyChampionIds: z.array(z.number().int().nonnegative()).max(5).optional(),
  enemyChampionIds: z.array(z.number().int().nonnegative()).max(5).optional(),
  allyPlayers: z.array(matchParticipantSummarySchema).max(5).optional(),
  enemyPlayers: z.array(matchParticipantSummarySchema).max(5).optional(),
  goldEarned: z.number().int().nonnegative().optional(),
  totalDamageDealtToChampions: z.number().int().nonnegative().optional(),
  totalDamageTaken: z.number().int().nonnegative().optional(),
  teamDamageShare: z.number().min(0).max(1).optional(),
  teamDamageTakenShare: z.number().min(0).max(1).optional(),
  teamGoldShare: z.number().min(0).max(1).optional(),
  achievements: z.array(matchAchievementSchema).max(7).optional()
}).strict();

const favoriteChampionSchema = z.object({
  championId: z.number().int().nonnegative(),
  games: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  averageKills: z.number().nonnegative().optional(),
  averageDeaths: z.number().nonnegative().optional(),
  averageAssists: z.number().nonnegative().optional()
}).strict();

export const personalHistorySchema: z.ZodType<PersonalHistorySnapshot> = z.object({
  playerId: z.string(),
  displayName: z.string(),
  profileIconId: z.number().int().nonnegative(),
  rank: z.string().optional(),
  matches: z.array(matchSummarySchema).max(20),
  sampleSize: z.number().int().min(0).max(20),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  averageKda: z.number().nonnegative(),
  favoriteChampions: z.array(favoriteChampionSchema).max(20),
  assetVersion: z.string().min(1).optional(),
  itemIconPaths: z.record(z.string(), z.string().min(1)).optional(),
  historyDataVersion: z.number().int().positive().optional(),
  cached: z.boolean(),
  updatedAt: z.number()
}).strict();

export const personalHistoryTargetSchema = z.object({
  playerId: z.string().min(1),
  puuid: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  profileIconId: z.number().int().nonnegative().optional()
}).strict();
export type PersonalHistoryTarget = z.infer<typeof personalHistoryTargetSchema>;

export const playerSnapshotSchema: z.ZodType<PlayerSnapshot> = z.object({
  playerId: z.string(),
  displayName: z.string(),
  teamId: z.number().int(),
  isLocalTeam: z.boolean().optional(),
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
  errorCode: z.enum(['PRIVACY_RESTRICTED', 'CLIENT_UNAVAILABLE', 'DATA_SERVICE_UNAVAILABLE', 'INVALID_RESPONSE', 'UNKNOWN']).optional(),
  error: z.string().optional(),
  updatedAt: z.number()
}).strict();

export const liveMatchSchema = z.object({
  players: z.array(playerSnapshotSchema).length(10),
  gameId: z.string().min(1).optional(),
  localTeamId: z.number().int().nullable().optional(),
  queueId: z.number().int().nonnegative(),
  modeName: z.string().min(1),
  positionOrderReliable: z.boolean()
}).strict();
export const liveRosterPlayerSchema = z.object({
  playerId: z.string().min(1),
  displayName: z.string().min(1),
  teamId: z.number().int(),
  isLocalTeam: z.boolean().optional(),
  lane: laneSchema,
  championId: z.number().int().nonnegative()
}).strict();
export const liveRosterSchema = z.object({
  players: z.array(liveRosterPlayerSchema).length(10),
  gameId: z.string().min(1).optional(),
  localTeamId: z.number().int().nullable().optional(),
  queueId: z.number().int().nonnegative(),
  modeName: z.string().min(1),
  positionOrderReliable: z.boolean()
}).strict();
export const liveMatchRequestSchema = z.object({ scope: queueScopeSchema, generation: z.number().int().nonnegative() }).strict();
export const playerUpdateSchema = z.object({ generation: z.number().int().nonnegative(), player: playerSnapshotSchema }).strict();
export const gameflowPhaseSchema = z.string().min(1);
export const gameflowSessionIdentitySchema = z.object({ phase: gameflowPhaseSchema, gameId: z.string().min(1).optional() }).strict();
export type GameflowSessionIdentity = z.infer<typeof gameflowSessionIdentitySchema>;

export const championLaneSchema = z.enum(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);
export const championCatalogEntrySchema = z.object({
  id: z.number().int().positive(), name: z.string().min(1), title: z.string().min(1),
  alias: z.string().min(1), roles: z.array(z.string().min(1)).max(4)
}).strict();
export const championCatalogSchema = z.array(championCatalogEntrySchema);
export const championAbilitySchema = z.object({
  key: z.enum(['P', 'Q', 'W', 'E', 'R']), name: z.string().min(1),
  description: z.string(), iconPath: z.string().min(1)
}).strict();
export const championDetailsSchema = z.object({
  id: z.number().int().positive(), name: z.string().min(1), title: z.string().min(1),
  alias: z.string().min(1), shortBio: z.string(), roles: z.array(z.string().min(1)).max(4),
  abilities: z.array(championAbilitySchema).min(4).max(5)
}).strict();
export const championDetailsRequestSchema = z.object({ championId: z.number().int().positive() }).strict();
export const championGuideSnapshotSchema = z.object({
  championId: z.number().int().positive(), lane: championLaneSchema,
  patch: z.string().regex(/^\d+\.\d+$/), source: z.enum(['CN_OFFICIAL', 'OPGG', 'MANUAL']),
  region: z.string().min(2), tier: z.string().min(1), fetchedAt: z.string().datetime(),
  builds: z.array(z.object({ itemIds: z.array(z.number().int().positive()).min(2), pickRate: z.number().min(0).max(1).optional() }).strict()),
  itemIconPaths: z.record(z.string(), z.string().min(1)).optional(),
  skillOrders: z.array(z.object({ keys: z.array(z.enum(['Q', 'W', 'E', 'R'])).length(18), pickRate: z.number().min(0).max(1).optional() }).strict()).max(3).optional(),
  starterItemIds: z.array(z.number().int().positive()).max(4).optional(),
  bootsItemIds: z.array(z.number().int().positive()).max(3).optional(),
  summonerSpellIds: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  favorable: z.array(z.object({ opponentChampionId: z.number().int().positive(), winRate: z.number().min(0).max(1), games: z.number().int().nonnegative().optional() }).strict()),
  unfavorable: z.array(z.object({ opponentChampionId: z.number().int().positive(), winRate: z.number().min(0).max(1), games: z.number().int().nonnegative().optional() }).strict()),
  notes: z.array(z.string().max(240)).max(5)
}).strict();
export const championGuideSchema = championGuideSnapshotSchema.extend({ stale: z.boolean() }).strict();
export const championGuideRequestSchema = z.object({ championId: z.number().int().positive(), lane: championLaneSchema }).strict();
export type ChampionLane = z.infer<typeof championLaneSchema>;
export type ChampionGuideSnapshot = z.infer<typeof championGuideSnapshotSchema>;
export type ChampionGuide = z.infer<typeof championGuideSchema>;
export type ChampionCatalogEntry = z.infer<typeof championCatalogEntrySchema>;
export type ChampionDetails = z.infer<typeof championDetailsSchema>;

export interface LiveMatch {
  players: PlayerSnapshot[];
  gameId?: string;
  localTeamId?: number | null;
  queueId: number;
  modeName: string;
  positionOrderReliable: boolean;
}

export type LiveRosterPlayer = z.infer<typeof liveRosterPlayerSchema>;
export type LiveRoster = z.infer<typeof liveRosterSchema>;

export interface LolViewerApi {
  getPersonalHistory(target?: PersonalHistoryTarget): Promise<PersonalHistorySnapshot>;
  getLiveMatch(scope: QueueScope, generation?: number): Promise<LiveMatch>;
  getLiveRoster(): Promise<LiveRoster>;
  getGameflowPhase(): Promise<string>;
  getGameflowSessionIdentity(): Promise<GameflowSessionIdentity>;
  retryLiveMatch?(): Promise<void>;
  cancelLiveMatch?(): Promise<void>;
  onPlayerUpdated(listener: (player: PlayerSnapshot, generation?: number) => void): () => void;
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  clearCache(): Promise<void>;
  getChampionGuide(championId: number, lane: ChampionLane): Promise<ChampionGuide>;
  getChampionCatalog(): Promise<ChampionCatalogEntry[]>;
  getChampionDetails(championId: number): Promise<ChampionDetails>;
}

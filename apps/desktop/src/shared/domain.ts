export type Lane = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY' | 'UNKNOWN';

export type QueueScope = 'ranked-solo' | 'all';

export type QueueMode = 'RANKED' | 'NORMAL' | 'ARAM' | 'OTHER';

export type DataStatus = 'loading' | 'ready' | 'unavailable';

export type MatchAchievementType =
  | 'MOST_KILLS'
  | 'MOST_ASSISTS'
  | 'MOST_DAMAGE'
  | 'MOST_DAMAGE_TAKEN';

export interface MatchAchievement {
  type: MatchAchievementType;
  value: number;
}

export interface MatchParticipantSummary {
  championId: number;
  playerId?: string;
  puuid?: string;
  displayName?: string;
  profileIconId?: number;
}

export interface MatchSummary {
  matchId: string;
  queueId: number;
  endedAt: number;
  durationSeconds: number;
  championId: number;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  cs?: number;
  lane?: Lane;
  itemIds?: number[];
  summonerSpellIds?: [number, number];
  allyChampionIds?: number[];
  enemyChampionIds?: number[];
  allyPlayers?: MatchParticipantSummary[];
  enemyPlayers?: MatchParticipantSummary[];
  goldEarned?: number;
  totalDamageDealtToChampions?: number;
  totalDamageTaken?: number;
  teamDamageShare?: number;
  teamDamageTakenShare?: number;
  teamGoldShare?: number;
  achievements?: MatchAchievement[];
}

export interface FavoriteChampion {
  championId: number;
  games: number;
  wins: number;
  winRate: number;
  averageKills?: number;
  averageDeaths?: number;
  averageAssists?: number;
}

export interface PersonalHistorySnapshot {
  playerId: string;
  displayName: string;
  profileIconId: number;
  rank?: string;
  matches: MatchSummary[];
  sampleSize: number;
  wins: number;
  losses: number;
  winRate: number;
  averageKda: number;
  favoriteChampions: FavoriteChampion[];
  assetVersion?: string;
  itemIconPaths?: Record<string, string>;
  historyDataVersion?: number;
  cached: boolean;
  updatedAt: number;
}

export interface PlayerSnapshot {
  playerId: string;
  displayName: string;
  teamId: number;
  isLocalTeam?: boolean;
  lane: Lane;
  championId: number;
  assetVersion?: string;
  rank?: string;
  scope: QueueScope;
  matches: MatchSummary[];
  sampleSize: number;
  wins: number;
  losses: number;
  winRate: number;
  currentChampionGames: number;
  currentChampionWins: number;
  currentChampionWinRate: number;
  status: DataStatus;
  error?: string;
  updatedAt: number;
}

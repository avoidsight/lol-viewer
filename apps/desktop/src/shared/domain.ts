export type Lane = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY' | 'UNKNOWN';

export type QueueScope = 'ranked-solo' | 'all';

export type DataStatus = 'loading' | 'ready' | 'unavailable';

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
}

export interface PlayerSnapshot {
  playerId: string;
  displayName: string;
  teamId: number;
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

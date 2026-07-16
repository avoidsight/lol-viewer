import type { PlayerSnapshot, QueueScope } from './domain';

export const MATCH_GET_CHANNEL = 'match:get-live' as const;
export const PLAYER_UPDATED_CHANNEL = 'match:player-updated' as const;

export interface LiveMatch {
  players: PlayerSnapshot[];
}

export interface LolViewerApi {
  getLiveMatch(scope: QueueScope): Promise<LiveMatch>;
  onPlayerUpdated(listener: (player: PlayerSnapshot) => void): () => void;
}

import type { PlayerSnapshot } from '../../../../shared/domain';
import type { LiveMatch } from '../../../../shared/ipc';

export type LiveMatchStatus =
  | 'waiting'
  | 'loading'
  | 'current'
  | 'last-match'
  | 'new-match-loading'
  | 'error';

export interface LiveMatchViewState {
  status: LiveMatchStatus;
  match?: LiveMatch;
  progress: PlayerSnapshot[];
  requesting: boolean;
  phase?: string;
}

export type LiveMatchAction =
  | { type: 'request-started' }
  | { type: 'player-updated'; player: PlayerSnapshot }
  | { type: 'request-succeeded'; match: LiveMatch }
  | { type: 'request-failed' }
  | { type: 'phase-observed'; phase: string; active: boolean }
  | { type: 'new-match-detected'; phase: string };

export const initialLiveMatchState: LiveMatchViewState = {
  status: 'waiting',
  progress: [],
  requesting: false
};

export function liveMatchReducer(
  state: LiveMatchViewState,
  action: LiveMatchAction
): LiveMatchViewState {
  switch (action.type) {
    case 'request-started':
      return state.match
        ? { ...state, requesting: true }
        : {
            ...state,
            status: state.status === 'new-match-loading' ? 'new-match-loading' : 'loading',
            progress: [],
            requesting: true
          };
    case 'player-updated':
      return {
        ...state,
        status: state.match ? state.status : 'loading',
        progress: [
          ...state.progress.filter((entry) => entry.playerId !== action.player.playerId),
          action.player
        ]
      };
    case 'request-succeeded':
      return {
        status: 'current',
        match: action.match,
        progress: [],
        requesting: false,
        ...(state.phase ? { phase: state.phase } : {})
      };
    case 'request-failed':
      return state.match
        ? { ...state, requesting: false }
        : { ...state, status: 'error', requesting: false };
    case 'phase-observed':
      return {
        ...state,
        phase: action.phase,
        ...(state.match ? { status: action.active ? 'current' : 'last-match' } : {})
      };
    case 'new-match-detected':
      return {
        status: 'new-match-loading',
        progress: [],
        requesting: false,
        phase: action.phase
      };
  }
}

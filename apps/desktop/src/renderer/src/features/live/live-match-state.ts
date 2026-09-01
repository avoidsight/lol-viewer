import type { PlayerSnapshot } from '../../../../shared/domain';
import type { LiveMatch, LiveRoster } from '../../../../shared/ipc';

export type LiveMatchStatus =
  | 'waiting'
  | 'loading'
  | 'current'
  | 'last-match'
  | 'new-match-loading'
  | 'error';
export type LiveMatchErrorReason = 'client-unavailable' | 'not-in-match' | 'data-unavailable';

export interface LiveMatchViewState {
  status: LiveMatchStatus;
  match?: LiveMatch;
  progress: PlayerSnapshot[];
  requesting: boolean;
  phase?: string;
  errorReason?: LiveMatchErrorReason;
}

export type LiveMatchAction =
  | { type: 'request-started' }
  | { type: 'player-updated'; player: PlayerSnapshot }
  | { type: 'request-succeeded'; match: LiveMatch }
  | { type: 'roster-refreshed'; roster: LiveRoster }
  | { type: 'request-failed'; reason?: LiveMatchErrorReason }
  | { type: 'phase-observed'; phase: string; active: boolean }
  | { type: 'new-match-detected'; phase: string };

export const initialLiveMatchState: LiveMatchViewState = {
  status: 'waiting',
  progress: [],
  requesting: false
};

function mergeRoster(match: LiveMatch, roster: LiveRoster): LiveMatch {
  const existingByTeam = new Map<number, PlayerSnapshot[]>();
  const used = new Set<PlayerSnapshot>();
  for (const player of match.players) {
    existingByTeam.set(player.teamId, [...(existingByTeam.get(player.teamId) ?? []), player]);
  }
  const players = roster.players.map((player) => {
    const team = existingByTeam.get(player.teamId) ?? [];
    const existing = team.find((entry) => !used.has(entry) && entry.playerId === player.playerId)
      ?? team.find((entry) => !used.has(entry));
    if (!existing) return undefined;
    used.add(existing);
    const championMatches = existing.matches.filter((entry) => entry.championId === player.championId);
    const currentChampionWins = championMatches.filter((entry) => entry.win).length;
    return {
      ...existing,
      ...player,
      currentChampionGames: championMatches.length,
      currentChampionWins,
      currentChampionWinRate: championMatches.length ? currentChampionWins / championMatches.length : 0
    };
  }).filter((player): player is PlayerSnapshot => player !== undefined);
  return players.length === roster.players.length
    ? { ...roster, players }
    : match;
}

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
            requesting: true,
            errorReason: undefined
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
        ...(state.phase ? { phase: state.phase } : {}),
        errorReason: undefined
      };
    case 'roster-refreshed':
      return state.match
        ? { ...state, match: mergeRoster(state.match, action.roster) }
        : state;
    case 'request-failed':
      return state.match
        ? { ...state, requesting: false }
        : { ...state, status: 'error', requesting: false, errorReason: action.reason ?? 'data-unavailable' };
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

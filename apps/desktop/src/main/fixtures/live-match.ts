import type { FavoriteChampion, MatchSummary, PersonalHistorySnapshot, PlayerSnapshot, QueueScope } from '../../shared/domain';
import type { LiveMatch } from '../../shared/ipc';

const lanes = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;

function liveMatchesFor(playerIndex: number): MatchSummary[] {
  return Array.from({ length: 10 }, (_, matchIndex) => ({
    matchId: `fixture-${playerIndex}-${matchIndex}`,
    queueId: 420,
    endedAt: Date.UTC(2026, 0, 1) - matchIndex * 1_800_000,
    durationSeconds: 1_800,
    championId: 1 + ((playerIndex + matchIndex) % 20),
    win: matchIndex % 2 === 0,
    kills: 3 + matchIndex,
    deaths: 2,
    assists: 5 + matchIndex,
    cs: 180 + matchIndex
  }));
}

function personalMatchesFor(): MatchSummary[] {
  const queueIds = [420, 430, 440, 450] as const;
  const templates = liveMatchesFor(0);
  return Array.from({ length: 20 }, (_, matchIndex) => ({
    ...templates[matchIndex % templates.length],
    matchId: `fixture-personal-${matchIndex}`,
    queueId: queueIds[matchIndex % queueIds.length],
    endedAt: Date.UTC(2026, 0, 1) - matchIndex * 1_800_000
  }));
}

function favoriteChampionsFor(matches: MatchSummary[]): FavoriteChampion[] {
  const groups = new Map<number, { games: number; wins: number }>();
  for (const match of matches) {
    const group = groups.get(match.championId) ?? { games: 0, wins: 0 };
    group.games += 1;
    if (match.win) group.wins += 1;
    groups.set(match.championId, group);
  }
  return [...groups.entries()]
    .map(([championId, group]) => ({
      championId, games: group.games, wins: group.wins, winRate: group.wins / group.games
    }))
    .sort((left, right) => right.games - left.games || left.championId - right.championId)
    .slice(0, 5);
}

export function createFixturePersonalHistory(): PersonalHistorySnapshot {
  const matches = personalMatchesFor();
  const wins = matches.filter((match) => match.win).length;
  const kills = matches.reduce((sum, match) => sum + match.kills, 0);
  const deaths = matches.reduce((sum, match) => sum + match.deaths, 0);
  const assists = matches.reduce((sum, match) => sum + match.assists, 0);
  return {
    playerId: 'fixture-personal-player',
    displayName: 'Fixture Personal Player',
    profileIconId: 29,
    rank: 'GOLD IV 50 LP',
    matches,
    sampleSize: matches.length,
    wins,
    losses: matches.length - wins,
    winRate: wins / matches.length,
    averageKda: (kills + assists) / deaths,
    favoriteChampions: favoriteChampionsFor(matches),
    assetVersion: '26.1.1',
    cached: false,
    updatedAt: Date.UTC(2026, 0, 1)
  };
}

export function createFixtureLiveMatch(scope: QueueScope): LiveMatch {
  const players: PlayerSnapshot[] = Array.from({ length: 10 }, (_, index) => {
    const matches = liveMatchesFor(index);
    const wins = matches.filter((match) => match.win).length;
    return {
      playerId: `fixture-player-${index}`,
      displayName: `Fixture Player ${index + 1}`,
      teamId: index < 5 ? 100 : 200,
      isLocalTeam: index < 5,
      lane: lanes[index % 5],
      championId: index + 1,
      rank: 'Fixture',
      scope,
      matches,
      sampleSize: 10,
      wins,
      losses: 10 - wins,
      winRate: wins / 10,
      currentChampionGames: 1,
      currentChampionWins: 1,
      currentChampionWinRate: 1,
      status: 'ready',
      updatedAt: Date.UTC(2026, 0, 1)
    };
  });
  return { players, localTeamId: 100, queueId: 420, modeName: '单双排', positionOrderReliable: true };
}

export function fixtureModeEnabled(
  argv: readonly string[],
  isPackaged: boolean,
  environment: NodeJS.ProcessEnv
): boolean {
  const explicitTestGuard = environment.PLAYWRIGHT_TEST === '1' || environment.NODE_ENV === 'development';
  return !isPackaged && explicitTestGuard && argv.includes('--fixture-live-match');
}

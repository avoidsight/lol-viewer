import type { MatchSummary, PlayerSnapshot, QueueScope } from '../../shared/domain';
import type { LiveMatch } from '../../shared/ipc';

const lanes = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;

function matchesFor(playerIndex: number): MatchSummary[] {
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

export function createFixtureLiveMatch(scope: QueueScope): LiveMatch {
  const players: PlayerSnapshot[] = Array.from({ length: 10 }, (_, index) => {
    const matches = matchesFor(index);
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
  return { players, localTeamId: 100 };
}

export function fixtureModeEnabled(
  argv: readonly string[],
  isPackaged: boolean,
  environment: NodeJS.ProcessEnv
): boolean {
  const explicitTestGuard = environment.PLAYWRIGHT_TEST === '1' || environment.NODE_ENV === 'development';
  return !isPackaged && explicitTestGuard && argv.includes('--fixture-live-match');
}

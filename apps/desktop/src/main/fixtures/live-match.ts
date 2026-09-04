import type { FavoriteChampion, MatchSummary, PersonalHistorySnapshot, PlayerSnapshot, QueueScope } from '../../shared/domain';
import type { LiveMatch, PersonalHistoryTarget } from '../../shared/ipc';

const lanes = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;
const fixtureNames = ['夜航星', '峡谷气象员', '青钢影子', '第七只魄罗', '河道守夜人', '不交闪现', '红方打野', '月下回城', '兵线管理员', '最后一块饼干'] as const;
const fixtureRanks = ['DIAMOND IV 62 LP', 'EMERALD I 18 LP', 'DIAMOND III 41 LP', 'MASTER 286 LP', 'EMERALD II 73 LP', 'DIAMOND IV 12 LP', 'MASTER 104 LP', 'EMERALD I 55 LP', 'DIAMOND II 8 LP', 'DIAMOND IV 88 LP'] as const;
const fixtureWins = [7, 6, 5, 8, 4, 6, 7, 4, 5, 6] as const;

function liveMatchesFor(playerIndex: number): MatchSummary[] {
  return Array.from({ length: 10 }, (_, matchIndex) => ({
    matchId: `fixture-${playerIndex}-${matchIndex}`,
    queueId: 420,
    endedAt: Date.UTC(2026, 0, 1) - matchIndex * 1_800_000,
    durationSeconds: 1_800,
    championId: matchIndex % 4 === 0 ? playerIndex + 1 : 21 + ((playerIndex * 3 + matchIndex) % 30),
    win: ((matchIndex * 7 + playerIndex * 3) % 10) < fixtureWins[playerIndex],
    kills: 2 + ((playerIndex * 3 + matchIndex * 2) % 13),
    deaths: 1 + ((playerIndex + matchIndex * 2) % 9),
    assists: 4 + ((playerIndex * 5 + matchIndex * 3) % 18),
    ...(matchIndex === 0 && playerIndex === 0 ? {
      mvp: true,
      achievements: [
        { type: 'MOST_KILLS' as const, value: 12 },
        { type: 'MOST_DAMAGE' as const, value: 31_500 }
      ]
    } : {}),
    ...(matchIndex === 1 && playerIndex % 4 === 0 ? { multiKill: 3 as const }
      : matchIndex === 3 && playerIndex === 3 ? { multiKill: 4 as const }
        : {}),
    cs: 142 + ((playerIndex * 19 + matchIndex * 13) % 116),
    itemIds: [3071, 3053, 3006, 6333, 3156, 3078],
    summonerSpellIds: [4, matchIndex % 2 === 0 ? 12 : 14] as [number, number]
  }));
}

function personalMatchesFor(target?: PersonalHistoryTarget): MatchSummary[] {
  const queueIds = [420, 430, 440, 450] as const;
  const templates = liveMatchesFor(0);
  return Array.from({ length: 20 }, (_, matchIndex) => {
    const base = templates[matchIndex % templates.length];
    const allies = Array.from({ length: 5 }, (_, index) => ({
      championId: index === 0 ? base.championId : 20 + index,
      playerId: index === 0 ? target?.playerId ?? 'fixture-personal-player' : `fixture-ally-${matchIndex}-${index}`,
      puuid: index === 0 ? target?.puuid ?? 'fixture-personal-puuid' : `fixture-ally-puuid-${matchIndex}-${index}`,
      displayName: index === 0 ? target?.displayName ?? 'Fixture Personal Player' : `Fixture Ally ${index}`,
      profileIconId: index === 0 ? target?.profileIconId ?? 29 : 29 + index
    }));
    const enemies = Array.from({ length: 5 }, (_, index) => ({
      championId: 30 + index,
      playerId: `fixture-enemy-${matchIndex}-${index}`,
      puuid: `fixture-enemy-puuid-${matchIndex}-${index}`,
      displayName: `Fixture Enemy ${index + 1}`,
      profileIconId: 40 + index
    }));
    return {
      ...base,
      matchId: `fixture-personal-${matchIndex}`,
      queueId: queueIds[matchIndex % queueIds.length],
      endedAt: Date.UTC(2026, 0, 1) - matchIndex * 1_800_000,
      allyChampionIds: allies.map(({ championId }) => championId),
      enemyChampionIds: enemies.map(({ championId }) => championId),
      allyPlayers: allies,
      enemyPlayers: enemies
    };
  });
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

export function createFixturePersonalHistory(target?: PersonalHistoryTarget): PersonalHistorySnapshot {
  const matches = personalMatchesFor(target);
  const wins = matches.filter((match) => match.win).length;
  const kills = matches.reduce((sum, match) => sum + match.kills, 0);
  const deaths = matches.reduce((sum, match) => sum + match.deaths, 0);
  const assists = matches.reduce((sum, match) => sum + match.assists, 0);
  return {
    playerId: target?.playerId ?? 'fixture-personal-player',
    displayName: target?.displayName ?? 'Fixture Personal Player',
    profileIconId: target?.profileIconId ?? 29,
    rank: 'GOLD IV 50 LP',
    matches,
    sampleSize: matches.length,
    wins,
    losses: matches.length - wins,
    winRate: wins / matches.length,
    averageKda: (kills + assists) / deaths,
    favoriteChampions: favoriteChampionsFor(matches),
    assetVersion: '26.1.1',
    itemIconPaths: Object.fromEntries([3071, 3053, 3006, 6333, 3156, 3078].map((itemId) => [
      String(itemId), `/lol-game-data/assets/ASSETS/Items/Icons2D/${itemId}.png`
    ])),
    historyDataVersion: 9,
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
      displayName: fixtureNames[index],
      teamId: index < 5 ? 100 : 200,
      isLocalTeam: index < 5,
      lane: lanes[index % 5],
      championId: index + 1,
      rank: fixtureRanks[index],
      scope,
      matches,
      sampleSize: 10,
      wins,
      losses: 10 - wins,
      winRate: wins / 10,
      currentChampionGames: matches.filter((match) => match.championId === index + 1).length,
      currentChampionWins: matches.filter((match) => match.championId === index + 1 && match.win).length,
      currentChampionWinRate: matches.filter((match) => match.championId === index + 1 && match.win).length / matches.filter((match) => match.championId === index + 1).length,
      status: 'ready',
      updatedAt: Date.UTC(2026, 0, 1)
    };
  });
  return { players, localTeamId: 100, queueId: 420, modeName: '单双排', positionOrderReliable: true };
}

export function createFixtureAramLiveMatch(scope: QueueScope): LiveMatch {
  const base = createFixtureLiveMatch(scope);
  const names = [
    'ARAM Ally Zoe', 'ARAM Ally Garen', 'ARAM Ally Lux', 'ARAM Ally Ashe', 'ARAM Ally Braum',
    'ARAM Enemy Jinx', 'ARAM Enemy Darius', 'ARAM Enemy Ahri', 'ARAM Enemy Lee', 'ARAM Enemy Lulu'
  ];
  const rosterLanes = ['MIDDLE', 'TOP', 'UTILITY', 'BOTTOM', 'JUNGLE'] as const;
  return {
    ...base,
    players: base.players.map((player, index) => ({
      ...player,
      displayName: names[index],
      lane: rosterLanes[index % rosterLanes.length]
    })),
    queueId: 450,
    modeName: '极地大乱斗',
    positionOrderReliable: false
  };
}

export function fixtureModeEnabled(
  argv: readonly string[],
  isPackaged: boolean,
  environment: NodeJS.ProcessEnv
): boolean {
  const explicitTestGuard = environment.PLAYWRIGHT_TEST === '1' || environment.NODE_ENV === 'development';
  return !isPackaged && explicitTestGuard
    && (argv.includes('--fixture-live-match') || argv.includes('--fixture-aram'));
}

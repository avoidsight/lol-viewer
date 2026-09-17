import { z } from 'zod';
import type { Lane, MatchAchievement, MatchParticipantSummary, MatchSummary, QueueScope } from '../../shared/domain';
import { isBuildItem } from '../../shared/items';
import { rankedMatchForm } from '../../shared/ranked-form';
export { describeQueue } from '../../shared/queue';

const laneSchema = z.enum(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);

const participantSchema = z.object({
  participantId: z.number().int().positive().optional(),
  championId: z.number().int().nonnegative(),
  teamId: z.number().int().optional(),
  spell1Id: z.number().int().positive().optional(),
  spell2Id: z.number().int().positive().optional(),
  mvp: z.boolean().optional(),
  isMvp: z.boolean().optional(),
  stats: z.object({
    win: z.boolean(),
    kills: z.number().int().nonnegative(),
    deaths: z.number().int().nonnegative(),
    assists: z.number().int().nonnegative(),
    gameEndedInEarlySurrender: z.boolean().optional(),
    mvp: z.boolean().optional(),
    isMvp: z.boolean().optional(),
    largestMultiKill: z.number().int().nonnegative().optional(),
    largestKillingSpree: z.number().int().nonnegative().optional(),
    doubleKills: z.number().int().nonnegative().optional(),
    tripleKills: z.number().int().nonnegative().optional(),
    quadraKills: z.number().int().nonnegative().optional(),
    pentaKills: z.number().int().nonnegative().optional(),
    totalMinionsKilled: z.number().int().nonnegative().optional(),
    neutralMinionsKilled: z.number().int().nonnegative().optional(),
    goldEarned: z.number().int().nonnegative().optional(),
    totalDamageDealtToChampions: z.number().int().nonnegative().optional(),
    totalDamageTaken: z.number().int().nonnegative().optional(),
    item0: z.number().int().nonnegative().optional(),
    item1: z.number().int().nonnegative().optional(),
    item2: z.number().int().nonnegative().optional(),
    item3: z.number().int().nonnegative().optional(),
    item4: z.number().int().nonnegative().optional(),
    item5: z.number().int().nonnegative().optional(),
    item6: z.number().int().nonnegative().optional()
  }),
  timeline: z
    .object({
      lane: z.string().optional()
    })
    .optional()
});

const participantIdentitySchema = z.object({
  participantId: z.number().int().positive(),
  player: z.object({
    summonerId: z.union([z.string(), z.number()]).optional(),
    puuid: z.string().min(1).optional(),
    gameName: z.string().optional(),
    tagLine: z.string().optional(),
    summonerName: z.string().optional(),
    displayName: z.string().optional(),
    profileIconId: z.number().int().nonnegative().optional(),
    profileIcon: z.number().int().nonnegative().optional()
  }).passthrough()
});

export const matchHistoryGameSchema = z.object({
  gameId: z.union([z.string(), z.number()]),
  queueId: z.number().int(),
  gameCreation: z.number().int().nonnegative(),
  gameDuration: z.number().int().nonnegative(),
  participants: z.array(participantSchema).min(1),
  participantIdentities: z.array(participantIdentitySchema).optional()
});

export const matchHistoryResponseSchema = z.preprocess((input) => {
  if (!input || typeof input !== 'object') return input;
  const root = input as Record<string, unknown>;
  const gamesEnvelope = root.games;
  if (!gamesEnvelope || typeof gamesEnvelope !== 'object' || Array.isArray(gamesEnvelope)) return input;
  const nestedGames = (gamesEnvelope as Record<string, unknown>).games;
  return Array.isArray(nestedGames) ? { ...root, games: nestedGames } : input;
}, z.object({ games: z.array(matchHistoryGameSchema) }));

interface AdaptOptions {
  scope: QueueScope;
  limit: 10 | 20;
}

function normalizeLane(lane: string | undefined): Lane | undefined {
  if (lane === undefined) return undefined;
  return laneSchema.safeParse(lane).success ? (lane as Lane) : 'UNKNOWN';
}

function teamShare(
  localValue: number | undefined,
  values: Array<number | undefined>
): number | undefined {
  if (localValue === undefined || values.length === 0 || values.some((value) => value === undefined)) {
    return undefined;
  }
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return total > 0 ? localValue / total : undefined;
}

function participantCs(participant: z.infer<typeof participantSchema>): number | undefined {
  const values = [participant.stats.totalMinionsKilled, participant.stats.neutralMinionsKilled];
  return values.some((value) => value !== undefined)
    ? values.reduce<number>((total, value) => total + (value ?? 0), 0)
    : undefined;
}

function participantMultiKill(stats: z.infer<typeof participantSchema>['stats']): 2 | 3 | 4 | 5 | undefined {
  if ((stats.pentaKills ?? 0) > 0 || (stats.largestMultiKill ?? 0) >= 5) return 5;
  if ((stats.quadraKills ?? 0) > 0 || stats.largestMultiKill === 4) return 4;
  if ((stats.tripleKills ?? 0) > 0 || stats.largestMultiKill === 3) return 3;
  if ((stats.doubleKills ?? 0) > 0 || stats.largestMultiKill === 2) return 2;
  return undefined;
}

function participantSummaries(
  game: z.infer<typeof matchHistoryGameSchema>,
  participants: Array<z.infer<typeof participantSchema>>
): MatchParticipantSummary[] {
  const identities = new Map(
    (game.participantIdentities ?? []).map((identity) => [identity.participantId, identity.player])
  );
  return participants.map((participant) => {
    const identity = participant.participantId === undefined
      ? undefined
      : identities.get(participant.participantId);
    const gameName = identity?.gameName?.trim();
    const tagLine = identity?.tagLine?.trim();
    const fallbackName = identity?.summonerName?.trim() || identity?.displayName?.trim();
    const displayName = gameName ? `${gameName}${tagLine ? `#${tagLine}` : ''}` : fallbackName;
    const playerId = identity?.summonerId === undefined
      ? identity?.puuid
      : String(identity.summonerId);
    const profileIconId = identity?.profileIconId ?? identity?.profileIcon;
    return {
      championId: participant.championId,
      ...(playerId ? { playerId } : {}),
      ...(identity?.puuid ? { puuid: identity.puuid } : {}),
      ...(displayName ? { displayName } : {}),
      ...(profileIconId === undefined ? {} : { profileIconId })
    };
  });
}

function performanceAward(game: z.infer<typeof matchHistoryGameSchema>): 'MVP' | 'SVP' | undefined {
  const target = game.participants[0];
  if (target.teamId === undefined) return;
  const team = game.participants.filter(p => p.teamId === target.teamId);
  if (team.length !== 5 || team.some(p => p.participantId === undefined || p.stats.win !== target.stats.win || p.stats.gameEndedInEarlySurrender)
    || new Set(team.map(p => p.participantId)).size !== 5) return;
  const kills = team.reduce((sum, p) => sum + p.stats.kills, 0);
  if (kills === 0) return;
  const forms = team.map(p => rankedMatchForm({
    matchId: String(game.gameId), queueId: game.queueId, endedAt: game.gameCreation + game.gameDuration * 1000,
    durationSeconds: game.gameDuration, championId: p.championId, win: p.stats.win,
    kills: p.stats.kills, deaths: p.stats.deaths, assists: p.stats.assists,
    killParticipation: (p.stats.kills + p.stats.assists) / kills,
    teamDamageShare: teamShare(p.stats.totalDamageDealtToChampions, team.map(entry => entry.stats.totalDamageDealtToChampions)),
    teamDamageTakenShare: teamShare(p.stats.totalDamageTaken, team.map(entry => entry.stats.totalDamageTaken))
  }));
  if (forms.some(form => !form?.complete)) return;
  const targetScore = forms[0]!.score;
  // No arbitrary winner on capped/near-equal scores; never use array order to break ties.
  if (forms.slice(1).some(form => form!.score >= targetScore - 1e-6)) return;
  return target.stats.win ? 'MVP' : 'SVP';
}

function mapGame(game: z.infer<typeof matchHistoryGameSchema>): MatchSummary {
  const participant = game.participants[0];
  const lane = normalizeLane(participant.timeline?.lane);
  const cs = participantCs(participant);
  const mvp = participant.mvp ?? participant.isMvp ?? participant.stats.mvp ?? participant.stats.isMvp;
  const award = performanceAward(game);
  const multiKill = participantMultiKill(participant.stats);
  const itemIds = [
    participant.stats.item0, participant.stats.item1, participant.stats.item2,
    participant.stats.item3, participant.stats.item4, participant.stats.item5,
  ].filter((itemId): itemId is number =>
    itemId !== undefined && isBuildItem(itemId));
  const summonerSpellIds = participant.spell1Id !== undefined && participant.spell2Id !== undefined
    ? [participant.spell1Id, participant.spell2Id] as [number, number]
    : undefined;
  const allyChampionIds = participant.teamId === undefined
    ? undefined
    : game.participants
      .filter((entry) => entry.teamId === participant.teamId)
      .map((entry) => entry.championId)
      .slice(0, 5);
  const enemyChampionIds = participant.teamId === undefined
    ? undefined
    : game.participants
      .filter((entry) => entry.teamId !== undefined && entry.teamId !== participant.teamId)
      .map((entry) => entry.championId)
      .slice(0, 5);
  const allyParticipants = participant.teamId === undefined
    ? []
    : game.participants.filter((entry) => entry.teamId === participant.teamId).slice(0, 5);
  const enemyParticipants = participant.teamId === undefined
    ? []
    : game.participants
      .filter((entry) => entry.teamId !== undefined && entry.teamId !== participant.teamId)
      .slice(0, 5);
  const allyPlayers = participantSummaries(game, allyParticipants);
  const enemyPlayers = participantSummaries(game, enemyParticipants);
  const teamParticipants = participant.teamId === undefined
    ? []
    : game.participants.filter((entry) => entry.teamId === participant.teamId);
  const teamDamageShare = teamShare(
    participant.stats.totalDamageDealtToChampions,
    teamParticipants.map((entry) => entry.stats.totalDamageDealtToChampions)
  );
  const teamKills = teamParticipants.reduce((total, entry) => total + entry.stats.kills, 0);
  const involvement = participant.stats.kills + participant.stats.assists;
  const killParticipation = teamParticipants.length === 5 && teamKills > 0 && involvement <= teamKills
    ? involvement / teamKills : undefined;
  const teamDamageTakenShare = teamShare(
    participant.stats.totalDamageTaken,
    teamParticipants.map((entry) => entry.stats.totalDamageTaken)
  );
  const teamGoldShare = teamShare(
    participant.stats.goldEarned,
    teamParticipants.map((entry) => entry.stats.goldEarned)
  );
  const achievementMetrics: Array<{
    type: MatchAchievement['type'];
    value: number | undefined;
    values: Array<number | undefined>;
  }> = [
    {
      type: 'MOST_KILLS',
      value: participant.stats.kills,
      values: game.participants.map((entry) => entry.stats.kills)
    },
    {
      type: 'MOST_ASSISTS',
      value: participant.stats.assists,
      values: game.participants.map((entry) => entry.stats.assists)
    },
    {
      type: 'MOST_DEATHS',
      value: participant.stats.deaths,
      values: game.participants.map((entry) => entry.stats.deaths)
    },
    {
      type: 'MOST_DAMAGE',
      value: participant.stats.totalDamageDealtToChampions,
      values: game.participants.map((entry) => entry.stats.totalDamageDealtToChampions)
    },
    {
      type: 'MOST_DAMAGE_TAKEN',
      value: participant.stats.totalDamageTaken,
      values: game.participants.map((entry) => entry.stats.totalDamageTaken)
    },
    {
      type: 'MOST_GOLD',
      value: participant.stats.goldEarned,
      values: game.participants.map((entry) => entry.stats.goldEarned)
    },
    {
      type: 'MOST_CS',
      value: cs,
      values: game.participants.map(participantCs)
    }
  ];
  const achievements = achievementMetrics.flatMap<MatchAchievement>(({ type, value, values }) => {
    if (
      value === undefined ||
      value <= 0 ||
      game.participants.length < 10 ||
      values.some((entry) => entry === undefined)
    ) return [];
    return value === Math.max(...values as number[]) ? [{ type, value }] : [];
  });

  return {
    matchId: String(game.gameId),
    queueId: game.queueId,
    endedAt: game.gameCreation + game.gameDuration * 1_000,
    durationSeconds: game.gameDuration,
    championId: participant.championId,
    win: participant.stats.win,
    kills: participant.stats.kills,
    deaths: participant.stats.deaths,
    assists: participant.stats.assists,
    ...(killParticipation === undefined ? {} : { killParticipation }),
    ...(participant.stats.gameEndedInEarlySurrender === undefined ? {} : { remake: participant.stats.gameEndedInEarlySurrender }),
    ...(mvp === true ? { mvp: true } : {}),
    ...(award ? { performanceAward: award } : {}),
    ...(multiKill === undefined ? {} : { multiKill }),
    ...(participant.stats.largestKillingSpree === undefined ? {} : { largestKillingSpree: participant.stats.largestKillingSpree }),
    ...(cs === undefined ? {} : { cs }),
    ...(lane === undefined ? {} : { lane }),
    ...(itemIds.length === 0 ? {} : { itemIds }),
    ...(summonerSpellIds === undefined ? {} : { summonerSpellIds }),
    ...(allyChampionIds === undefined ? {} : { allyChampionIds }),
    ...(enemyChampionIds === undefined ? {} : { enemyChampionIds }),
    ...(allyPlayers.length === 0 ? {} : { allyPlayers }),
    ...(enemyPlayers.length === 0 ? {} : { enemyPlayers }),
    ...(participant.stats.goldEarned === undefined ? {} : { goldEarned: participant.stats.goldEarned }),
    ...(participant.stats.totalDamageDealtToChampions === undefined
      ? {}
      : { totalDamageDealtToChampions: participant.stats.totalDamageDealtToChampions }),
    ...(participant.stats.totalDamageTaken === undefined
      ? {}
      : { totalDamageTaken: participant.stats.totalDamageTaken }),
    ...(teamDamageShare === undefined ? {} : { teamDamageShare }),
    ...(teamDamageTakenShare === undefined ? {} : { teamDamageTakenShare }),
    ...(teamGoldShare === undefined ? {} : { teamGoldShare }),
    ...(achievements.length === 0 ? {} : { achievements })
  };
}

export function adaptMatchHistory(input: unknown, { scope, limit }: AdaptOptions): MatchSummary[] {
  const history = matchHistoryResponseSchema.parse(input);
  return history.games
    .filter((game) => scope === 'all' || game.queueId === 420)
    .map(mapGame)
    .sort((left, right) => right.endedAt - left.endedAt)
    .slice(0, limit);
}

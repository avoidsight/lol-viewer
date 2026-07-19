import { z } from 'zod';
import type { Lane, MatchSummary, QueueScope } from '../../shared/domain';
export { describeQueue } from '../../shared/queue';

const laneSchema = z.enum(['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY']);

const participantSchema = z.object({
  championId: z.number().int().nonnegative(),
  stats: z.object({
    win: z.boolean(),
    kills: z.number().int().nonnegative(),
    deaths: z.number().int().nonnegative(),
    assists: z.number().int().nonnegative(),
    totalMinionsKilled: z.number().int().nonnegative().optional(),
    neutralMinionsKilled: z.number().int().nonnegative().optional()
  }),
  timeline: z
    .object({
      lane: z.string().optional()
    })
    .optional()
});

const gameSchema = z.object({
  gameId: z.union([z.string(), z.number()]),
  queueId: z.number().int(),
  gameCreation: z.number().int().nonnegative(),
  gameDuration: z.number().int().nonnegative(),
  participants: z.array(participantSchema).min(1)
});

export const matchHistoryResponseSchema = z.preprocess((input) => {
  if (!input || typeof input !== 'object') return input;
  const root = input as Record<string, unknown>;
  const gamesEnvelope = root.games;
  if (!gamesEnvelope || typeof gamesEnvelope !== 'object' || Array.isArray(gamesEnvelope)) return input;
  const nestedGames = (gamesEnvelope as Record<string, unknown>).games;
  return Array.isArray(nestedGames) ? { ...root, games: nestedGames } : input;
}, z.object({ games: z.array(gameSchema) }));

interface AdaptOptions {
  scope: QueueScope;
  limit: 10 | 20;
}

function normalizeLane(lane: string | undefined): Lane | undefined {
  if (lane === undefined) return undefined;
  return laneSchema.safeParse(lane).success ? (lane as Lane) : 'UNKNOWN';
}

function mapGame(game: z.infer<typeof gameSchema>): MatchSummary {
  const participant = game.participants[0];
  const lane = normalizeLane(participant.timeline?.lane);
  const csFields = [participant.stats.totalMinionsKilled, participant.stats.neutralMinionsKilled];
  const cs = csFields.some((value) => value !== undefined)
    ? csFields.reduce<number>((total, value) => total + (value ?? 0), 0)
    : undefined;

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
    ...(cs === undefined ? {} : { cs }),
    ...(lane === undefined ? {} : { lane })
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

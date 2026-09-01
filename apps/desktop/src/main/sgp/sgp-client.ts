import { z } from 'zod';
import type { LcuClient } from '../lcu/http-client';

const entitlementsSchema = z.object({ accessToken: z.string().min(1) });
const leagueSessionTokenSchema = z.string().min(1);
const sgpParticipantSchema = z.object({
  puuid: z.string(), championId: z.number().int().nonnegative(),
  kills: z.number().int().nonnegative(), deaths: z.number().int().nonnegative(),
  assists: z.number().int().nonnegative(), win: z.boolean(), teamId: z.number().int().optional(),
  riotIdGameName: z.string().optional(), riotIdTagline: z.string().optional(),
  summonerName: z.string().optional(), profileIconId: z.number().int().nonnegative().optional()
});
const sgpHistorySchema = z.object({ games: z.array(z.object({ json: z.object({
  gameId: z.number(), queueId: z.number().int(), gameCreation: z.number(),
  gameDuration: z.number(), participants: z.array(sgpParticipantSchema)
}) })) });
const sgpRankedSchema = z.object({ queues: z.array(z.object({
  queueType: z.string(), tier: z.string().optional(), rank: z.string().optional(),
  leaguePoints: z.number().int()
})) });

const tencentHosts: Record<string, string> = {
  HN1: 'https://hn1-k8s-sgp.lol.qq.com:21019',
  HN10: 'https://hn10-k8s-sgp.lol.qq.com:21019',
  TJ100: 'https://tj100-sgp.lol.qq.com:21019',
  TJ101: 'https://tj101-sgp.lol.qq.com:21019',
  NJ100: 'https://nj100-sgp.lol.qq.com:21019',
  GZ100: 'https://gz100-sgp.lol.qq.com:21019',
  CQ100: 'https://cq100-sgp.lol.qq.com:21019',
  BGP2: 'https://bgp2-k8s-sgp.lol.qq.com:21019',
  PBE: 'https://pbe-sgp.lol.qq.com:21019',
  PREPBE: 'https://prepbe-sgp.lol.qq.com:21019'
};

export interface SgpClient {
  getHistory(puuid: string, count: number): Promise<unknown>;
  getRankedStats(puuid: string): Promise<{ queues: Array<{ queueType: string; tier: string; division: string; leaguePoints: number }> }>;
}

async function readJson(request: typeof fetch, url: string, token: string): Promise<unknown> {
  const response = await request(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`SGP request failed with status ${response.status}`);
  return response.json();
}

export function createSgpClient(lcu: LcuClient, rsoPlatformId: string, request: typeof fetch = fetch): SgpClient {
  const baseUrl = tencentHosts[rsoPlatformId.toUpperCase()];
  if (!baseUrl) throw new Error(`Unsupported Tencent platform: ${rsoPlatformId}`);

  return {
    async getHistory(puuid, count) {
      const { accessToken } = entitlementsSchema.parse(
        await lcu.get('/entitlements/v1/token', entitlementsSchema)
      );
      const url = `${baseUrl}/match-history-query/v1/products/lol/player/${encodeURIComponent(puuid)}/SUMMARY?startIndex=0&count=${count}`;
      const source = sgpHistorySchema.parse(await readJson(request, url, accessToken));
      return { games: source.games.flatMap(({ json: game }) => {
        const target = game.participants.find((participant) => participant.puuid === puuid);
        if (!target) return [];
        const ordered = [target, ...game.participants.filter((participant) => participant !== target)];
        return [{
          gameId: game.gameId,
          queueId: game.queueId,
          gameCreation: game.gameCreation,
          gameDuration: game.gameDuration,
          participants: ordered.map((participant, index) => ({
            participantId: index + 1,
            championId: participant.championId,
            ...(participant.teamId === undefined ? {} : { teamId: participant.teamId }),
            stats: {
              win: participant.win,
              kills: participant.kills,
              deaths: participant.deaths,
              assists: participant.assists
            }
          })),
          participantIdentities: ordered.map((participant, index) => ({
            participantId: index + 1,
            player: {
              puuid: participant.puuid,
              ...(participant.riotIdGameName ? { gameName: participant.riotIdGameName } : {}),
              ...(participant.riotIdTagline ? { tagLine: participant.riotIdTagline } : {}),
              ...(participant.summonerName ? { summonerName: participant.summonerName } : {}),
              ...(participant.profileIconId === undefined ? {} : { profileIconId: participant.profileIconId })
            }
          }))
        }];
      }) };
    },

    async getRankedStats(puuid) {
      const token = leagueSessionTokenSchema.parse(
        await lcu.get('/lol-league-session/v1/league-session-token', leagueSessionTokenSchema)
      );
      const url = `${baseUrl}/leagues-ledge/v2/rankedStats/puuid/${encodeURIComponent(puuid)}`;
      const source = sgpRankedSchema.parse(await readJson(request, url, token));
      return { queues: source.queues.flatMap((queue) =>
        queue.tier && queue.rank ? [{
          queueType: queue.queueType,
          tier: queue.tier,
          division: queue.rank,
          leaguePoints: queue.leaguePoints
        }] : []) };
    }
  };
}

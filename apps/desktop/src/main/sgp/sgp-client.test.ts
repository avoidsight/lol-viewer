import { describe, expect, it, vi } from 'vitest';
import type { LcuClient } from '../lcu/http-client';
import { createSgpClient } from './sgp-client';

describe('SgpClient', () => {
  it('uses the entitlements token and converts a player summary to LCU history shape', async () => {
    const lcu = { get: vi.fn(async (path: string) => {
      if (path === '/entitlements/v1/token') return { accessToken: 'entitlement-token' };
      if (path === '/lol-league-session/v1/league-session-token') return 'league-token';
      throw new Error(path);
    }) } as unknown as LcuClient;
    const request = vi.fn(async () => new Response(JSON.stringify({ games: [{
      json: {
        gameId: 7, queueId: 440, gameCreation: 1000, gameDuration: 900,
        participants: [
          { puuid: 'other', championId: 2, kills: 1, deaths: 2, assists: 3, win: false, teamId: 100 },
          { puuid: 'target', championId: 99, kills: 8, deaths: 4, assists: 12, win: true, teamId: 200 }
        ]
      }
    }] }), { status: 200 }));
    const client = createSgpClient(lcu, 'HN1', request);

    const history = await client.getHistory('target', 10);

    expect(request).toHaveBeenCalledWith(
      'https://hn1-k8s-sgp.lol.qq.com:21019/match-history-query/v1/products/lol/player/target/SUMMARY?startIndex=0&count=10',
      expect.objectContaining({ headers: { Authorization: 'Bearer entitlement-token' } })
    );
    expect(history).toMatchObject({ games: [{ gameId: 7, queueId: 440 }] });
    expect((history as { games: Array<{ participants: unknown[] }> }).games[0].participants[0]).toMatchObject(
      { championId: 99, stats: { win: true, kills: 8, deaths: 4, assists: 12 } }
    );
  });

  it('loads ranked stats with the league-session token', async () => {
    const lcu = { get: vi.fn(async (path: string) => path.includes('entitlements')
      ? { accessToken: 'entitlement-token' }
      : 'league-token') } as unknown as LcuClient;
    const request = vi.fn(async () => new Response(JSON.stringify({ queues: [{
      queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 42
    }] }), { status: 200 }));

    const ranked = await createSgpClient(lcu, 'HN1', request).getRankedStats('target');

    expect(request).toHaveBeenCalledWith(
      'https://hn1-k8s-sgp.lol.qq.com:21019/leagues-ledge/v2/rankedStats/puuid/target',
      expect.objectContaining({ headers: { Authorization: 'Bearer league-token' } })
    );
    expect(ranked).toEqual({ queues: [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', division: 'II', leaguePoints: 42 }] });
  });
});

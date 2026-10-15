import { describe, expect, it, vi } from 'vitest';
import type { LcuClient } from '../lcu/http-client';
import { createOptionalSgpClient, createSgpClient } from './sgp-client';

describe('SgpClient', () => {
  it('allows local queries when a regional SGP host is unsupported', () => {
    const lcu = { get: vi.fn() } as unknown as LcuClient;
    expect(createOptionalSgpClient(lcu, 'UNKNOWN-REGION')).toBeUndefined();
    expect(createOptionalSgpClient(lcu, 'hn1')).toBeDefined();
    expect(lcu.get).not.toHaveBeenCalled();
  });
  it('aborts a hung remote request within eight seconds and sanitizes the error', async () => {
    vi.useFakeTimers();
    try {
      const lcu = { get: vi.fn().mockResolvedValue({ accessToken: 'test-token' }) } as unknown as LcuClient;
      const request: typeof fetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('private-url-token')));
      }));
      const result = createSgpClient(lcu, 'HN1', request).getHistory('target', 20).catch(error => error);
      await vi.advanceTimersByTimeAsync(8000);
      expect(await result).toMatchObject({ message: 'SGP request timed out' });
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('bounds the response body, including bodies without a content-length', async () => {
    const lcu = { get: vi.fn().mockResolvedValue({ accessToken: 'test-token' }) } as unknown as LcuClient;
    const request = vi.fn(async () => new Response('x'.repeat(16 * 1024 * 1024 + 1)));
    await expect(createSgpClient(lcu, 'HN1', request).getHistory('target', 20)).rejects.toMatchObject({ code: 'SGP_RESPONSE_TOO_LARGE' });
  });
  it.each([false, true])('accepts twenty summaries exceeding 2 MiB (content-length: %s)', async contentLength => {
    const lcu = { get: vi.fn().mockResolvedValue({ accessToken: 'test-token' }) } as unknown as LcuClient;
    // Synthetic forward-compatible extra statistics reproduce the size of full SGP games.
    const body = JSON.stringify({ games: Array.from({ length: 20 }, (_, index) => ({ json: {
      gameId: index + 1, queueId: 420, gameCreation: 1000, gameDuration: 1800,
      participants: [{ puuid: 'target', championId: 1, kills: 8, deaths: 2, assists: 5, win: true,
        extraStatistics: 'x'.repeat(125_000) }]
    } })) });
    expect(Buffer.byteLength(body)).toBeGreaterThan(2 * 1024 * 1024);
    const request = vi.fn(async () => new Response(body, {
      headers: contentLength ? { 'content-length': String(Buffer.byteLength(body)) } : {}
    }));
    const result = await createSgpClient(lcu, 'HN1', request).getHistory('target', 20) as { games: unknown[] };
    expect(result.games).toHaveLength(20);
    expect(request).toHaveBeenCalledOnce();
  });
  it('rejects an oversized declared history before reading the body', async () => {
    const cancel = vi.fn();
    const response = new Response('{}', { headers: { 'content-length': String(16 * 1024 * 1024 + 1) } });
    vi.spyOn(response.body!, 'cancel').mockImplementation(cancel);
    const lcu = { get: vi.fn().mockResolvedValue({ accessToken: 'test-token' }) } as unknown as LcuClient;
    await expect(createSgpClient(lcu, 'HN1', vi.fn(async () => response)).getHistory('target', 20))
      .rejects.toMatchObject({ code: 'SGP_RESPONSE_TOO_LARGE' });
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('keeps the smaller bound for ranked responses', async () => {
    const lcu = { get: vi.fn().mockResolvedValue('test-token') } as unknown as LcuClient;
    const request = vi.fn(async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)));
    await expect(createSgpClient(lcu, 'HN1', request).getRankedStats('target'))
      .rejects.toMatchObject({ code: 'SGP_RESPONSE_TOO_LARGE' });
  });
  it('isolates invalid games and accepts missing optional SGP statistics', async () => {
    const lcu = { get: vi.fn(async () => ({ accessToken: 'test-token' })) } as unknown as LcuClient;
    const request = vi.fn(async () => new Response(JSON.stringify({ games: [
      { json: { gameId: 1, queueId: 420, gameCreation: 1000, gameDuration: 1800, participants: [
        { puuid: 'target', championId: 1, kills: 1, deaths: 2, assists: 3, win: true, goldEarned: null, summoner1Id: 0 }
      ] } }, { json: {} }
    ] })));
    const result = await createSgpClient(lcu, 'HN1', request).getHistory('target', 20) as { games: Array<{ participants: Array<{ stats: { goldEarned?: number } }> }> };
    expect(result.games).toHaveLength(1);
    expect(result.games[0].participants[0].stats.goldEarned).toBeUndefined();
  });
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
          {
            puuid: 'other', championId: 2, kills: 1, deaths: 2, assists: 3, win: false, teamId: 100,
            goldEarned: 9_000, totalDamageDealtToChampions: 10_000, totalDamageTaken: 11_000
          },
          {
            puuid: 'target', championId: 99, kills: 8, deaths: 4, assists: 12, win: true, teamId: 200,
            summoner1Id: 4, summoner2Id: 12, totalMinionsKilled: 180, neutralMinionsKilled: 20,
            mvp: true, largestMultiKill: 3, doubleKills: 2, tripleKills: 1,
            goldEarned: 14_250, totalDamageDealtToChampions: 31_500, totalDamageTaken: 28_100,
            item0: 3071, item1: 3053, item6: 3340, teamPosition: 'MIDDLE'
          }
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
      {
        championId: 99,
        mvp: true,
        spell1Id: 4,
        spell2Id: 12,
        timeline: { lane: 'MIDDLE' },
        stats: {
          win: true, kills: 8, deaths: 4, assists: 12,
          totalMinionsKilled: 180, neutralMinionsKilled: 20,
          largestMultiKill: 3, doubleKills: 2, tripleKills: 1,
          goldEarned: 14_250,
          totalDamageDealtToChampions: 31_500,
          totalDamageTaken: 28_100,
          item0: 3071,
          item1: 3053,
          item6: 3340
        }
      }
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

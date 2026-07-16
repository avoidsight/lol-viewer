import { describe, expect, it, vi } from 'vitest';
import type { LcuClient } from '../lcu/http-client';
import { MatchService } from './match-service';

const participants = Array.from({ length: 10 }, (_, index) => ({
  summonerId: String(index + 1),
  summonerName: `Player ${index + 1}`,
  teamId: index < 5 ? 100 : 200,
  selectedPosition: 'TOP',
  championId: index + 1
}));

const history = {
  games: [
    {
      gameId: 1,
      queueId: 420,
      gameCreation: 1_000,
      gameDuration: 600,
      participants: [
        {
          championId: 1,
          stats: { win: true, kills: 8, deaths: 3, assists: 4 },
          timeline: { lane: 'TOP' }
        }
      ]
    }
  ]
};

describe('MatchService', () => {
  it('emits nine ready players and one unavailable player without rejecting', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5) } };
      if (path.includes('/5/')) throw Object.assign(new Error('offline'), { code: 'LCU_AUTH' });
      return history;
    });
    const service = new MatchService({ get } as LcuClient, { sleep: async () => undefined });
    const updated: unknown[] = [];

    const result = await service.loadLiveMatch('ranked-solo', updated.push.bind(updated));

    expect(result.players).toHaveLength(10);
    expect(result.players.filter((player) => player.status === 'ready')).toHaveLength(9);
    expect(result.players.filter((player) => player.status === 'unavailable')).toHaveLength(1);
    expect(updated).toHaveLength(10);
  });

  it('limits player history requests to four concurrent calls', async () => {
    let active = 0;
    let maximum = 0;
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5) } };
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return history;
    });
    const service = new MatchService({ get } as LcuClient);
    await service.loadLiveMatch('all', () => undefined);

    expect(maximum).toBe(4);
  });

  it('retries transient failures twice using the required delays', async () => {
    const sleep = vi.fn(async () => undefined);
    let attempts = 0;
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5) } };
      if (path.includes('/1/') && attempts++ < 2) throw Object.assign(new Error('offline'), { code: 'LCU_UNAVAILABLE' });
      return history;
    });
    const service = new MatchService({ get } as LcuClient, { sleep });

    await service.loadLiveMatch('all', () => undefined);

    expect(sleep.mock.calls).toEqual([[250], [750]]);
  });
});

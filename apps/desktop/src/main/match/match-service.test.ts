import { describe, expect, it, vi } from 'vitest';
import type { LcuClient } from '../lcu/http-client';
import type { PlayerSnapshot } from '../../shared/domain';
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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

describe('MatchService', () => {
  it('refreshes a champion-select roster without loading rank or match history', async () => {
    const team = (offset: number) => Array.from({ length: 5 }, (_, index) => ({
      cellId: offset + index,
      summonerId: String(offset + index),
      championId: offset + index,
      assignedPosition: index === 0 ? 'TOP' : '',
      gameName: `Player ${offset + index}`,
      playerAlias: ''
    }));
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { phase: 'ChampSelect', gameData: { teamOne: [], teamTwo: [], queueId: 420 } };
      if (path === '/lol-champ-select/v1/session') return { myTeam: team(10), theirTeam: team(20), localPlayerCellId: 10, queueId: 420 };
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 'me', displayName: 'Me' };
      throw new Error(`Unexpected heavyweight request: ${path}`);
    });

    const result = await new MatchService({ get } as LcuClient).loadLiveRoster();

    expect(result).toMatchObject({ queueId: 420, modeName: '单双排', localTeamId: 100 });
    expect(result.players).toHaveLength(10);
    expect(result.players[0]).toMatchObject({ playerId: 'me', displayName: 'Me', championId: 10, isLocalTeam: true });
    expect(get).toHaveBeenCalledTimes(3);
    expect(get.mock.calls.some(([path]) => String(path).includes('match-history') || String(path).includes('ranked-stats'))).toBe(false);
  });

  it('falls back to the champ-select roster when the gameflow roster is empty', async () => {
    const champSelectTeam = (offset: number) => Array.from({ length: 5 }, (_, index) => ({
      summonerId: String(offset + index + 1),
      championId: offset + index + 1,
      assignedPosition: '',
      gameName: '',
      playerAlias: ''
    }));
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') {
        return { gameData: { teamOne: [], teamTwo: [], queue: { id: 450 } } };
      }
      if (path === '/lol-champ-select/v1/session') {
        return { myTeam: champSelectTeam(0), theirTeam: champSelectTeam(5), queueId: 0 };
      }
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 3 };
      if (path.includes('/ranked-stats/')) return { queues: [] };
      return history;
    });

    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', vi.fn());

    expect(get).toHaveBeenCalledWith('/lol-champ-select/v1/session', expect.anything());
    expect(result).toMatchObject({ queueId: 450, modeName: '极地大乱斗', localTeamId: 100, positionOrderReliable: false });
    expect(result.players).toHaveLength(10);
    expect(result.players.slice(0, 5).map((player) => player.playerId)).toEqual(['1', '2', '3', '4', '5']);
    expect(result.players[0].displayName).toBe('己方玩家 1');
    expect(result.players[5].displayName).toBe('敌方玩家 1');
  });

  it('prefers the new champion-select roster over stale gameflow teams', async () => {
    const newTeam = (offset: number) => Array.from({ length: 5 }, (_, index) => ({
      cellId: offset + index,
      summonerId: 'new-' + (offset + index),
      championId: 100 + offset + index,
      assignedPosition: '',
      gameName: 'New Player ' + (offset + index),
      playerAlias: ''
    }));
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return {
        phase: 'ChampSelect',
        gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId: 420 }
      };
      if (path === '/lol-champ-select/v1/session') return {
        myTeam: newTeam(10), theirTeam: newTeam(20), localPlayerCellId: 12, queueId: 420
      };
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 'real-me', displayName: '我的账号' };
      if (path.includes('/ranked-stats/')) return { queues: [] };
      return history;
    });

    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', vi.fn());

    expect(result.players.map((entry) => entry.playerId)).toContain('new-10');
    expect(result.players.map((entry) => entry.playerId)).not.toContain('1');
    expect(get).toHaveBeenCalledWith('/lol-champ-select/v1/session', expect.anything());
  });
  it('uses the current-summoner history route for the local anonymized champ-select slot', async () => {
    const team = (offset: number) => Array.from({ length: 5 }, (_, index) => ({
      cellId: offset + index,
      summonerId: `hidden-${offset + index}`,
      championId: offset + index + 1,
      assignedPosition: '', gameName: '', playerAlias: ''
    }));
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: [], teamTwo: [], queueId: 420 } };
      if (path === '/lol-champ-select/v1/session') return { myTeam: team(10), theirTeam: team(20), localPlayerCellId: 12, queueId: 420 };
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 'real-me', displayName: '我的账号' };
      if (path.includes('/ranked-stats/')) return { queues: [] };
      if (path === '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=20') return history;
      if (path.includes('/lol-match-history/')) throw new Error('privacy protected');
      return '15.14.1';
    });

    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', vi.fn());
    const local = result.players.find((entry) => entry.playerId === 'real-me');

    expect(local).toMatchObject({ displayName: '我的账号', teamId: 100, status: 'ready', sampleSize: 1 });
    expect(get).toHaveBeenCalledWith('/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=20', expect.anything());
    expect(result.players.filter((entry) => entry.status === 'unavailable')).toHaveLength(9);
    expect(result.players.filter((entry) => entry.status === 'unavailable').every((entry) => entry.errorCode === 'PRIVACY_RESTRICTED')).toBe(true);
  });

  it('falls back to the current-summoner LCU history when local SGP history fails', async () => {
    const localParticipants = participants.map((entry, index) => index === 0
      ? { ...entry, puuid: 'local-puuid', isLocalPlayer: true }
      : entry);
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: localParticipants.slice(0, 5), teamTwo: localParticipants.slice(5), queueId: 420 } };
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: '1', displayName: '我的账号', puuid: 'local-puuid' };
      if (path.includes('/ranked-stats/')) return { queues: [] };
      if (path === '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=20') return history;
      return history;
    });
    const sgp = {
      getRankedStats: vi.fn().mockResolvedValue({ queues: [] }),
      getHistory: vi.fn().mockRejectedValue(new Error('SGP unavailable'))
    };

    const result = await new MatchService({ get } as LcuClient, { sgp }).loadLiveMatch('all', vi.fn());
    const local = result.players.find((entry) => entry.playerId === '1');

    expect(local).toMatchObject({ displayName: '我的账号', status: 'ready', sampleSize: 1 });
    expect(get).toHaveBeenCalledWith('/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=20', expect.anything());
  });
  it('marks SGP outages separately from player privacy restrictions', async () => {
    const identified = participants.map((entry, index) => ({ ...entry, puuid: `puuid-${index}` }));
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: identified.slice(0, 5), teamTwo: identified.slice(5), queueId: 420 } };
      throw new Error('optional LCU endpoint unavailable');
    });
    const sgp = {
      getRankedStats: vi.fn().mockResolvedValue({ queues: [] }),
      getHistory: vi.fn().mockRejectedValue(new Error('SGP unavailable'))
    };

    const result = await new MatchService({ get } as LcuClient, { sgp }).loadLiveMatch('all', vi.fn());

    expect(result.players.every((entry) => entry.errorCode === 'DATA_SERVICE_UNAVAILABLE')).toBe(true);
  });
  it('stops starting LCU requests, player events, and cache writes after cancellation', async () => {
    const controller = new AbortController();
    const rankStarted = deferred<void>();
    const releaseRank = deferred<void>();
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId: 420 } };
      if (path.includes('/ranked-stats/')) {
        rankStarted.resolve();
        await releaseRank.promise;
        return { queues: [] };
      }
      return history;
    });
    const cache = { get: vi.fn(() => null), put: vi.fn() };
    const onPlayer = vi.fn();
    const pending = new MatchService({ get } as LcuClient, { cache }).loadLiveMatch('all', onPlayer, controller.signal);
    await rankStarted.promise;
    controller.abort();
    releaseRank.resolve();

    await expect(pending).rejects.toMatchObject({ code: 'MATCH_CANCELLED', message: 'Live match request cancelled' });
    expect(onPlayer).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
    expect(get.mock.calls.filter(([path]) => String(path).includes('/matches?'))).toHaveLength(0);
  });
  it('returns ARAM metadata, preserves roster order, and keeps all-mode histories', async () => {
    const aramParticipants = participants.map(({ selectedPosition: _selectedPosition, ...participant }) => participant);
    const normalHistory = { games: history.games.map((game) => ({ ...game, queueId: 430 })) };
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') {
        return { gameData: { teamOne: aramParticipants.slice(0, 5), teamTwo: aramParticipants.slice(5), queue: { id: 450 } } };
      }
      return normalHistory;
    });

    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('ranked-solo', vi.fn());

    expect(result).toMatchObject({ queueId: 450, modeName: '极地大乱斗', positionOrderReliable: false });
    expect(result.players.slice(0, 5).map((player) => player.playerId)).toEqual(['1', '2', '3', '4', '5']);
    expect(result.players.every((player) => player.scope === 'all')).toBe(true);
    expect(result.players.every((player) => player.matches.map((match) => match.queueId).includes(430))).toBe(true);
  });

  it.each([
    [{ id: 420 }, undefined, '单双排'],
    [{ id: 440 }, undefined, '灵活排位'],
    [undefined, 400, '匹配模式'],
    [undefined, 430, '匹配模式'],
    [{ id: 450 }, undefined, '极地大乱斗'],
    [{ id: 999 }, undefined, '其他模式']
  ])('derives live mode metadata from a strictly parsed session', async (queue, queueId, modeName) => {
    const positioned = participants.map((participant, index) => ({
      ...participant,
      selectedPosition: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][index % 5]
    }));
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') {
        return { gameData: { teamOne: positioned.slice(0, 5), teamTwo: positioned.slice(5), queue, queueId } };
      }
      return history;
    });

    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', () => undefined);

    expect(result).toMatchObject({ queueId: queue?.id ?? queueId, modeName });
    expect(result.positionOrderReliable).toBe((queue?.id ?? queueId) !== 450);
  });

  it('marks position order unreliable when either team lacks unique standard positions', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') {
        return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queue: { id: 420 } } };
      }
      return history;
    });

    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', () => undefined);

    expect(result.positionOrderReliable).toBe(false);
  });

  it('falls back to unknown mode and roster order when queue metadata is absent', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') {
        return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5) } };
      }
      return history;
    });

    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', () => undefined);

    expect(result).toMatchObject({ queueId: 0, modeName: '其他模式', positionOrderReliable: false });
    expect(result.players.slice(0, 5).map((player) => player.playerId)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('orients team 200 first using the strictly validated current summoner', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId: 420 } };
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 8 };
      if (path.includes('/ranked-stats/')) return { queues: [] };
      return history;
    });
    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', () => undefined);
    expect(result.players.slice(0, 5).every((player) => player.teamId === 200)).toBe(true);
  });

  it('restores the local player omitted from a four-player in-game team', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return {
        gameData: {
          teamOne: participants.slice(0, 4).map(({ summonerId, summonerName, selectedPosition, championId }) => ({ summonerId, summonerName, selectedPosition, championId })),
          teamTwo: participants.slice(5).map(({ summonerId, summonerName, selectedPosition, championId }) => ({ summonerId, summonerName, selectedPosition, championId })),
          queueId: 420,
          playerChampionSelections: [
            ...participants.slice(0, 4).map((entry) => ({ puuid: `p-${entry.summonerId}`, championId: entry.championId })),
            { puuid: 'local-puuid', championId: 99 },
            ...participants.slice(5).map((entry) => ({ puuid: `p-${entry.summonerId}`, championId: entry.championId }))
          ]
        }
      };
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 'real-me', displayName: '我的账号', puuid: 'local-puuid' };
      if (path.includes('/ranked-stats/')) return { queues: [] };
      return history;
    });

    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', vi.fn());

    expect(result.players).toHaveLength(10);
    expect(result.localTeamId).toBe(100);
    expect(result.players.find((entry) => entry.playerId === 'real-me')).toMatchObject({
      displayName: '我的账号', championId: 99, teamId: 100
    });
  });

  it('resolves Riot IDs when the in-game roster hides every summoner name', async () => {
    const hidden = participants.map((entry) => ({ ...entry, summonerName: '' }));
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: hidden.slice(0, 5), teamTwo: hidden.slice(5), queueId: 420 } };
      if (path.startsWith('/lol-summoner/v1/summoners/')) {
        const id = path.split('/').at(-1);
        return { gameName: `玩家${id}`, tagLine: 'CN1', displayName: '' };
      }
      if (path.includes('/ranked-stats/')) return { queues: [] };
      return history;
    });

    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', vi.fn());

    expect(result.players.map((entry) => entry.displayName)).toEqual(
      Array.from({ length: 10 }, (_, index) => `玩家${index + 1}#CN1`)
    );
  });

  it('uses the resolved PUUID for every remote player history and ranked lookup', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId: 420 } };
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: '1', displayName: 'Local', puuid: 'puuid-1' };
      if (path.startsWith('/lol-summoner/v1/summoners/')) {
        const id = path.split('/').at(-1);
        return { gameName: `Player ${id}`, tagLine: 'CN1', puuid: `puuid-${id}` };
      }
      if (path.startsWith('/lol-ranked/v1/ranked-stats/')) return { queues: [] };
      return history;
    });

    await new MatchService({ get } as LcuClient).loadLiveMatch('all', vi.fn());

    for (let id = 1; id <= 10; id += 1) {
      expect(get).toHaveBeenCalledWith(`/lol-ranked/v1/ranked-stats/puuid-${id}`, expect.anything());
      expect(get).toHaveBeenCalledWith(
        `/lol-match-history/v1/products/lol/puuid-${id}/matches?begIndex=0&endIndex=20`,
        expect.anything()
      );
    }
  });

  it('shows flex rank in flex queue and solo rank in every other queue', async () => {
    const load = async (queueId: number) => {
      const get = vi.fn(async (path: string) => {
        if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId } };
        if (path.startsWith('/lol-summoner/v1/summoners/')) {
          const id = path.split('/').at(-1);
          return { gameName: `Player ${id}`, puuid: `puuid-${id}` };
        }
        if (path.includes('/ranked-stats/')) return { queues: [
          { queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', division: 'I', leaguePoints: 60 },
          { queueType: 'RANKED_FLEX_SR', tier: 'PLATINUM', division: 'IV', leaguePoints: 12 }
        ] };
        return history;
      });
      return new MatchService({ get } as LcuClient).loadLiveMatch('all', vi.fn());
    };

    expect((await load(440)).players.every((player) => player.rank === '铂金 IV 12 胜点')).toBe(true);
    expect((await load(450)).players.every((player) => player.rank === '黄金 I 60 胜点')).toBe(true);
  });

  it('prefers SGP history and ranked data when a Tencent PUUID is available', async () => {
    const sgp = {
      getHistory: vi.fn(async () => history),
      getRankedStats: vi.fn(async () => ({ queues: [
        { queueType: 'RANKED_SOLO_5x5', tier: 'DIAMOND', division: 'IV', leaguePoints: 21 }
      ] }))
    };
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId: 2400 } };
      if (path.startsWith('/lol-summoner/v1/summoners/')) {
        const id = path.split('/').at(-1);
        return { gameName: `Player ${id}`, puuid: `puuid-${id}` };
      }
      if (path.includes('/match-history/') || path.includes('/ranked-stats/')) throw new Error('LCU route must not be used');
      return history;
    });

    const result = await new MatchService({ get } as LcuClient, { sgp }).loadLiveMatch('all', vi.fn());

    expect(sgp.getHistory).toHaveBeenCalledTimes(10);
    expect(sgp.getRankedStats).toHaveBeenCalledTimes(10);
    expect(result.players.every((player) => player.status === 'ready')).toBe(true);
    expect(result.players.every((player) => player.rank === '钻石 IV 21 胜点')).toBe(true);
  });

  it('keeps an anonymized live roster usable when the current summoner id does not match', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') {
        return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId: 420 } };
      }
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 'local-id-hidden-from-roster' };
      if (path.includes('/ranked-stats/')) return { queues: [] };
      return history;
    });

    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', vi.fn());

    expect(result.players).toHaveLength(10);
    expect(result.localTeamId).toBeNull();
    expect(result.players.every((player) => player.isLocalTeam === undefined)).toBe(true);
  });

  it('populates solo rank and isolates a single rank lookup failure', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId: 420 } };
      if (path === '/lol-summoner/v1/current-summoner') return { summonerId: 1 };
      if (path.includes('/ranked-stats/2')) throw new Error('rank offline');
      if (path.includes('/ranked-stats/')) return { queues: [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', division: 'II', leaguePoints: 42 }] };
      return history;
    });
    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', () => undefined);
    expect(result.players[0].rank).toBe('黄金 II 42 胜点');
    expect(result.players[1].rank).toBeUndefined();
    expect(result.players[1].matches).toHaveLength(1);
    expect(result.players.slice(2).every((player) => player.rank === '黄金 II 42 胜点')).toBe(true);
  });
  it('propagates a separately validated current asset version to every player', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId: 420 } };
      if (path === '/lol-patch/v1/game-version') return '15.14.1';
      return history;
    });
    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', () => undefined);
    expect(result.players.every((player) => player.assetVersion === '15.14.1')).toBe(true);
  });

  it.each([new Error('offline'), { version: 'invalid' }])('keeps history usable when version lookup is unavailable or invalid', async (versionResult) => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId: 420 } };
      if (path === '/lol-patch/v1/game-version') {
        if (versionResult instanceof Error) throw versionResult;
        return versionResult;
      }
      return history;
    });
    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', () => undefined);
    expect(result.players.every((player) => player.status === 'ready')).toBe(true);
    expect(result.players.every((player) => player.assetVersion === undefined)).toBe(true);
  });
  it('emits nine ready players and one unavailable player without rejecting', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId: 420 } };
      if (path.includes('/5/')) throw Object.assign(new Error('offline'), { code: 'LCU_AUTH' });
      return history;
    });
    const service = new MatchService({ get } as LcuClient, { sleep: async () => undefined });
    const updated: unknown[] = [];

    const result = await service.loadLiveMatch('ranked-solo', updated.push.bind(updated));

    expect(result.players).toHaveLength(10);
    expect(result.players.filter((player) => player.status === 'ready')).toHaveLength(9);
    expect(result.players.filter((player) => player.status === 'unavailable')).toEqual([
      expect.objectContaining({ errorCode: 'CLIENT_UNAVAILABLE' })
    ]);
    expect(updated).toHaveLength(10);
  });

  it('limits player history requests to four concurrent calls', async () => {
    let active = 0;
    let maximum = 0;
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId: 420 } };
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
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId: 420 } };
      if (path.includes('/1/') && attempts++ < 2) throw Object.assign(new Error('offline'), { code: 'LCU_UNAVAILABLE' });
      return history;
    });
    const service = new MatchService({ get } as LcuClient, { sleep });

    await service.loadLiveMatch('all', () => undefined);

    expect(sleep.mock.calls).toEqual([[250], [750]]);
  });

  it('rejects a structurally invalid nine-player session', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') {
        return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5, 9), queueId: 420 } };
      }
      return history;
    });

    await expect(new MatchService({ get } as LcuClient).loadLiveMatch('all', () => undefined))
      .rejects.toThrow();
    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenLastCalledWith('/lol-summoner/v1/current-summoner', expect.anything());
  });

  it('isolates throwing callbacks while returning all successful players once', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId: 420 } };
      return history;
    });
    const updated: string[] = [];

    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', (player) => {
      updated.push(player.playerId);
      if (player.playerId === '1') throw new Error('renderer gone');
    });

    expect(result.players).toHaveLength(10);
    expect(result.players.every((player) => player.status === 'ready')).toBe(true);
    expect(updated).toHaveLength(10);
    expect(new Set(updated).size).toBe(10);
  });

  it('uses only all-mode cache entries even when called with the legacy ranked scope', async () => {
    const cached: PlayerSnapshot = {
      playerId: '1', displayName: 'Old', teamId: 200, lane: 'JUNGLE', championId: 1,
      scope: 'ranked-solo', matches: [], sampleSize: 0, wins: 0, losses: 0, winRate: 0,
      currentChampionGames: 0, currentChampionWins: 0, currentChampionWinRate: 0,
      status: 'ready', updatedAt: 1
    };
    const cache = { get: vi.fn((id, scope) => id === '1' && scope === 'ranked-solo' ? cached : null), put: vi.fn() };
    const tenGameHistory = {
      games: Array.from({ length: 10 }, (_, index) => ({
        ...history.games[0], gameId: index + 1, queueId: index % 2 === 0 ? 420 : 430
      }))
    };
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId: 420 } };
      if (path.includes('/5/')) throw new Error('unavailable');
      return tenGameHistory;
    });
    const updated: string[] = [];

    const result = await new MatchService({ get } as LcuClient, { cache }).loadLiveMatch('ranked-solo', (player) => updated.push(player.playerId));

    expect(get.mock.calls.some(([path]) => String(path).includes('/1/'))).toBe(true);
    expect(result.players[0].displayName).toBe('Player 1');
    expect(result.players[0].scope).toBe('all');
    expect(result.players[0].matches).toHaveLength(10);
    expect(cache.get).toHaveBeenCalledWith('1', 'all');
    expect(cache.get.mock.calls.every(([, scope]) => scope === 'all')).toBe(true);
    expect(updated).toHaveLength(10);
    expect(cache.put).toHaveBeenCalledTimes(9);
    expect(cache.put.mock.calls.every(([player]) => player.status === 'ready' && player.scope === 'all')).toBe(true);
  });

  it('keeps twenty recent matches so the renderer can switch between all and ranked history', async () => {
    const twentyGameHistory = {
      games: Array.from({ length: 20 }, (_, index) => ({
        ...history.games[0],
        gameId: index + 1,
        gameCreation: 10_000 - index,
        queueId: index % 2 === 0 ? 420 : 430
      }))
    };
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') {
        return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId: 420 } };
      }
      if (path.includes('/ranked-stats/')) return { queues: [] };
      return twentyGameHistory;
    });

    const result = await new MatchService({ get } as LcuClient).loadLiveMatch('all', vi.fn());

    expect(result.players[0].matches).toHaveLength(20);
    expect(result.players[0].matches.filter((entry) => entry.queueId === 420)).toHaveLength(10);
  });

  it.each(['get', 'put'] as const)('keeps live-match loading operational when cache.%s throws', async (operation) => {
    const cache = {
      get: vi.fn(() => {
        if (operation === 'get') throw new Error('cache read failed');
        return null;
      }),
      put: vi.fn(() => {
        if (operation === 'put') throw new Error('cache write failed');
      })
    };
    const get = vi.fn(async (path: string) => {
      if (path === '/lol-gameflow/v1/session') return { gameData: { teamOne: participants.slice(0, 5), teamTwo: participants.slice(5), queueId: 420 } };
      return history;
    });
    const updated: string[] = [];

    const result = await new MatchService({ get } as LcuClient, { cache })
      .loadLiveMatch('ranked-solo', (player) => updated.push(player.playerId));

    expect(result.players).toHaveLength(10);
    expect(result.players.every((player) => player.status === 'ready')).toBe(true);
    expect(result.players[0].matches).toHaveLength(1);
    expect(updated).toHaveLength(10);
  });
});

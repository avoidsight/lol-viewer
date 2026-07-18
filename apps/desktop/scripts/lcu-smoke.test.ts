import { describe, expect, it, vi } from 'vitest';
import { runLcuSmoke, type SmokeClient } from './lcu-smoke';

const secret = 'PlayerName-SECRET id-991 https://127.0.0.1:4567 token-ABC raw-response';

describe('LCU smoke output', () => {
  it('prints every endpoint result and never leaks arbitrary error content', async () => {
    const lines: string[] = [];
    const client: SmokeClient = {
      get: vi.fn(async (path: string) => {
        if (path.includes('gameflow-phase')) throw Object.assign(new Error(secret), { code: 'LCU_AUTH' });
        if (path.includes('/session')) throw new Error(secret);
        throw new Error(secret);
      })
    };

    const exitCode = await runLcuSmoke({
      discover: async () => ({ port: 4567, password: 'token-ABC', protocol: 'https' }),
      createClient: () => client,
      write: (line) => lines.push(line)
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual([
      'phase: unavailable-or-incompatible [LCU_AUTH]',
      'participants: unavailable-or-incompatible [LCU_INVALID_RESPONSE]',
      'history: unavailable-or-incompatible [PREREQUISITE_UNAVAILABLE]'
    ]);
    expect(lines.join('\n')).not.toContain('PlayerName-SECRET');
    expect(lines.join('\n')).not.toContain('id-991');
    expect(lines.join('\n')).not.toContain('127.0.0.1');
    expect(lines.join('\n')).not.toContain('4567');
    expect(lines.join('\n')).not.toContain('token-ABC');
    expect(lines.join('\n')).not.toContain('raw-response');
  });

  it('reports all endpoints unavailable when no client is open', async () => {
    const lines: string[] = [];
    const exitCode = await runLcuSmoke({ discover: async () => null, write: (line) => lines.push(line) });
    expect(exitCode).toBe(2);
    expect(lines).toEqual([
      'phase: unavailable-or-incompatible [LCU_UNAVAILABLE]',
      'participants: unavailable-or-incompatible [LCU_UNAVAILABLE]',
      'history: unavailable-or-incompatible [LCU_UNAVAILABLE]'
    ]);
  });

  it('redacts discovery failures instead of rejecting with raw errors', async () => {
    const lines: string[] = [];
    const exitCode = await runLcuSmoke({
      discover: async () => { throw new Error(secret); },
      write: (line) => lines.push(line)
    });
    expect(exitCode).toBe(2);
    expect(lines).toHaveLength(3);
    expect(lines.join('\n')).not.toMatch(/PlayerName|id-991|127\.0\.0\.1|4567|token-ABC|raw-response/);
  });

  it('continues through history after an independent phase failure', async () => {
    const lines: string[] = [];
    const players = Array.from({ length: 5 }, (_, index) => ({
      summonerId: `id-991-${index}`,
      summonerName: `PlayerName-SECRET-${index}`,
      teamId: 100,
      championId: index + 1
    }));
    const get = vi.fn(async (path: string) => {
      if (path.includes('gameflow-phase')) throw Object.assign(new Error(secret), { code: 'LCU_UNAVAILABLE' });
      if (path.includes('/session')) return { gameData: { teamOne: players, teamTwo: players } };
      throw Object.assign(new Error(secret), { code: 'LCU_AUTH' });
    });

    expect(await runLcuSmoke({
      discover: async () => ({ port: 4567, password: 'token-ABC', protocol: 'https' }),
      createClient: () => ({ get }),
      write: (line) => lines.push(line)
    })).toBe(1);

    expect(get).toHaveBeenCalledTimes(3);
    expect(lines).toEqual([
      'phase: unavailable-or-incompatible [LCU_UNAVAILABLE]',
      'participants: compatible',
      'history: unavailable-or-incompatible [LCU_AUTH]'
    ]);
    expect(lines.join('\n')).not.toMatch(/PlayerName|id-991|127\.0\.0\.1|4567|token-ABC|raw-response/);
  });
});

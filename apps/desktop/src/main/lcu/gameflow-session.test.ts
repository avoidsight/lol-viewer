import { describe, expect, it, vi } from 'vitest';
import type { LcuClient } from './http-client';
import { readGameflowSessionIdentity } from './gameflow-session';

function clientWith(get: LcuClient['get']): LcuClient {
  return { get };
}

describe('readGameflowSessionIdentity', () => {
  it('does not request a session outside an active match phase', async () => {
    const get = vi.fn().mockResolvedValue('Lobby') as LcuClient['get'];

    await expect(readGameflowSessionIdentity(clientWith(get))).resolves.toEqual({ phase: 'Lobby' });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/lol-gameflow/v1/gameflow-phase', expect.anything());
  });

  it('returns the game id during an active match phase', async () => {
    const get = vi.fn(async (path: string) => path.endsWith('gameflow-phase')
      ? 'ChampSelect'
      : { phase: 'ChampSelect', gameData: { gameId: 12345 } }) as LcuClient['get'];

    await expect(readGameflowSessionIdentity(clientWith(get))).resolves.toEqual({
      phase: 'ChampSelect',
      gameId: '12345'
    });
  });

  it('keeps the known phase when the session endpoint is temporarily unavailable', async () => {
    const get = vi.fn(async (path: string) => {
      if (path.endsWith('gameflow-phase')) return 'InProgress';
      throw Object.assign(new Error('not found'), { code: 'LCU_INVALID_RESPONSE' });
    }) as LcuClient['get'];

    await expect(readGameflowSessionIdentity(clientWith(get))).resolves.toEqual({ phase: 'InProgress' });
  });

  it('returns an inactive state when the lightweight phase endpoint is unavailable', async () => {
    const get = vi.fn().mockRejectedValue(new Error('client unavailable')) as LcuClient['get'];

    await expect(readGameflowSessionIdentity(clientWith(get))).resolves.toEqual({ phase: 'None' });
  });
});

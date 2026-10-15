import { expect, it, vi } from 'vitest';
import { readHistorySource } from './history-source';

const games = { games: [{ gameId: 1, queueId: 420, gameCreation: 1, gameDuration: 600,
  participants: [{ championId: 1, stats: { win: true, kills: 8, deaths: 1, assists: 3 } }] }] };
it.each([new Error('SGP request timed out'), new Error('SGP request failed with status 503'), new Error('offline'), { games: [{}] }])
('uses a healthy alternative after failure or incompatible data', async result => {
  const read = result instanceof Error ? vi.fn().mockRejectedValue(result) : vi.fn().mockResolvedValue(result);
  const fallback = vi.fn().mockResolvedValue(games);
  expect(await readHistorySource({ kind: 'sgp', read }, { kind: 'lcu', read: fallback })).toEqual(games);
  expect(fallback).toHaveBeenCalledOnce();
});
it.each([401, 403, 429])('does not bypass SGP authorization/rate-limit response %s', async status => {
  const fallback = vi.fn().mockResolvedValue(games);
  await expect(readHistorySource({ kind: 'sgp', read: async () => { throw new Error(`SGP request failed with status ${status}`); } },
    { kind: 'lcu', read: fallback })).rejects.toThrow(String(status));
  expect(fallback).not.toHaveBeenCalled();
});
it('uses LCU for SGP 404 without claiming that the player has private history', async () => {
  const fallback = vi.fn().mockResolvedValue(games);
  expect(await readHistorySource({ kind: 'sgp', read: async () => { throw new Error('SGP request failed with status 404'); } },
    { kind: 'lcu', read: fallback })).toEqual(games);
  expect(fallback).toHaveBeenCalledOnce();
});
it('preserves a confirmed privacy restriction', async () => {
  const fallback = vi.fn();
  await expect(readHistorySource({ kind: 'sgp', read: async () => {
    throw Object.assign(new Error('Restricted'), { code: 'SGP_PRIVACY' });
  } }, { kind: 'lcu', read: fallback })).rejects.toMatchObject({ code: 'SGP_PRIVACY' });
  expect(fallback).not.toHaveBeenCalled();
});
it('does not hide cancellation behind an alternative query', async () => {
  const fallback = vi.fn();
  await expect(readHistorySource({ kind: 'lcu', read: async () => { throw { code: 'MATCH_CANCELLED' }; } }, { kind: 'sgp', read: fallback }))
    .rejects.toMatchObject({ code: 'MATCH_CANCELLED' });
  expect(fallback).not.toHaveBeenCalled();
});

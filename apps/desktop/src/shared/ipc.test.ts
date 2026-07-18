import { describe, expect, it } from 'vitest';
import { liveMatchSchema, personalHistorySchema } from './ipc';

describe('personalHistorySchema', () => {
  it('accepts exactly the validated personal snapshot and rejects unknown fields', () => {
    const value = {
      playerId: '7', displayName: 'Player', profileIconId: 29, rank: 'GOLD II 20 LP',
      matches: [], sampleSize: 0, wins: 0, losses: 0, winRate: 0, averageKda: 0,
      favoriteChampions: [], assetVersion: '16.14.1', cached: false, updatedAt: 1
    };
    expect(personalHistorySchema.parse(value)).toEqual(value);
    expect(() => personalHistorySchema.parse({ ...value, token: 'secret' })).toThrow();
  });

  it('requires live mode metadata', () => {
    expect(() => liveMatchSchema.parse({ players: [], queueId: 450 })).toThrow();
  });
});

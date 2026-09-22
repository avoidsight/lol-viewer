import { z } from 'zod';
import type { LcuClient } from '../lcu/http-client';
import { playerSearchInputSchema, type PlayerSearchResult } from '../../shared/player-search';

const summoners = z.array(z.object({
  summonerId: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  puuid: z.string().min(1), gameName: z.string(), tagLine: z.string(),
  profileIconId: z.number().int().nonnegative().optional()
})).max(20);

export async function searchPlayer(client: LcuClient, input: string): Promise<PlayerSearchResult> {
  const [gameName, tagLine] = playerSearchInputSchema.parse(input).split('#').map(part => part.trim());
  if (!client.postJson) return { ok: false, error: 'failed' };
  try {
    const results = await client.postJson('/lol-summoner/v1/summoners/aliases', [{ gameName, tagLine }], summoners);
    const player = results.find(entry => entry.gameName.toLocaleLowerCase() === gameName.toLocaleLowerCase() && entry.tagLine.toLocaleLowerCase() === tagLine.toLocaleLowerCase());
    if (!player) return { ok: false, error: 'not-found' };
    return { ok: true, target: { playerId: String(player.summonerId), puuid: player.puuid,
      displayName: `${player.gameName}#${player.tagLine}`, profileIconId: player.profileIconId } };
  } catch (error) {
    const code = (error as { code?: string })?.code;
    return { ok: false, error: code === 'LCU_UNAVAILABLE' || code === 'LCU_AUTH' ? 'unavailable' : 'failed' };
  }
}

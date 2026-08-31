import { z } from 'zod';
import { discoverLcuConnection } from '../src/main/lcu/discovery';
import { createLcuClient } from '../src/main/lcu/http-client';

const connection = await discoverLcuConnection();
if (!connection) throw new Error('client unavailable');
const client = createLcuClient(connection);
const session = await client.get('/lol-gameflow/v1/session', z.unknown()) as Record<string, any>;
const participants = [...(session.gameData?.teamOne ?? []), ...(session.gameData?.teamTwo ?? [])];
const selections = session.gameData?.playerChampionSelections ?? [];
const ids = [...new Set(participants.map((entry: any) => entry.summonerId).filter((value: unknown) => typeof value === 'number' || typeof value === 'string'))];
const puuids = [...new Set(selections.map((entry: any) => entry.puuid).filter((value: unknown) => typeof value === 'string' && value.length > 0))] as string[];

async function count<T>(values: T[], path: (value: T) => string, validate: (value: unknown) => boolean): Promise<number> {
  const results = await Promise.all(values.map(async (value) => {
    try { return validate(await client.get(path(value), z.unknown())) ? 1 : 0; } catch { return 0; }
  }));
  return results.reduce<number>((total, value) => total + value, 0);
}
const hasName = (value: unknown) => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return [record.gameName, record.displayName, record.internalName].some((entry) => typeof entry === 'string' && entry.trim().length > 0);
};
const hasGames = (value: unknown) => !!value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).games);

console.log(JSON.stringify({
  rosterParticipants: participants.length,
  championSelections: selections.length,
  nonEmptyNamesInSession: participants.filter((entry: any) => typeof entry.summonerName === 'string' && entry.summonerName.trim()).length,
  identityBySummonerId: await count(ids, (id) => `/lol-summoner/v1/summoners/${encodeURIComponent(String(id))}`, hasName),
  identityByPuuid: await count(puuids, (puuid) => `/lol-summoner/v2/summoners/puuid/${encodeURIComponent(puuid)}`, hasName),
  historyBySummonerId: await count(ids, (id) => `/lol-match-history/v1/products/lol/${encodeURIComponent(String(id))}/matches?begIndex=0&endIndex=20`, hasGames),
  historyByPuuid: await count(puuids, (puuid) => `/lol-match-history/v1/products/lol/${encodeURIComponent(puuid)}/matches?begIndex=0&endIndex=20`, hasGames),
  currentHistory: await count([0], () => '/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=20', hasGames)
}));

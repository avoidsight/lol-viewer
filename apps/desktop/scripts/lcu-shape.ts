import { z } from 'zod';
import { discoverLcuConnection } from '../src/main/lcu/discovery';
import { createLcuClient } from '../src/main/lcu/http-client';

const connection = await discoverLcuConnection();
if (!connection) {
  console.log('client: unavailable');
  process.exitCode = 2;
} else {
  const client = createLcuClient(connection);
  const session = await client.get('/lol-gameflow/v1/session', z.unknown()) as Record<string, unknown>;
  const gameData = session.gameData && typeof session.gameData === 'object' ? session.gameData as Record<string, unknown> : {};
  const describe = (value: unknown) => Array.isArray(value)
    ? { type: 'array', length: value.length, itemKeys: value[0] && typeof value[0] === 'object' ? Object.keys(value[0] as object).sort() : [], fieldTypes: value[0] && typeof value[0] === 'object' ? Object.fromEntries(Object.entries(value[0] as Record<string, unknown>).map(([key, entry]) => [key, entry === null ? 'null' : typeof entry])) : {} }
    : { type: value === null ? 'null' : typeof value };
  const current = await client.get('/lol-summoner/v1/current-summoner', z.unknown()) as Record<string, unknown>;
  const queue = gameData.queue && typeof gameData.queue === 'object' ? gameData.queue as Record<string, unknown> : {};
  console.log(JSON.stringify({
    sessionKeys: Object.keys(session).sort(),
    gameDataKeys: Object.keys(gameData).sort(),
    teamOne: describe(gameData.teamOne),
    teamTwo: describe(gameData.teamTwo),
    playerChampionSelections: describe(gameData.playerChampionSelections),
    phaseType: typeof session.phase,
    queueType: typeof gameData.queue,
    queueFieldTypes: Object.fromEntries(Object.entries(queue).map(([key, value]) => [key, value === null ? 'null' : typeof value])),
    currentSummonerFieldTypes: Object.fromEntries(Object.entries(current).map(([key, value]) => [key, value === null ? 'null' : typeof value])),
    queueIdType: typeof gameData.queueId
  }, null, 2));
}

import { z } from 'zod';
import { discoverLcuConnection } from '../src/main/lcu/discovery';
import { createLcuClient } from '../src/main/lcu/http-client';

const phaseSchema = z.string().min(1);
const participantSchema = z.object({
  summonerId: z.union([z.string(), z.number()]),
  summonerName: z.string(),
  teamId: z.number().int(),
  championId: z.number().int().nonnegative()
}).passthrough();
const sessionSchema = z.object({
  gameData: z.object({
    teamOne: z.array(participantSchema).length(5),
    teamTwo: z.array(participantSchema).length(5)
  }).passthrough()
}).passthrough();
const historySchema = z.object({ games: z.array(z.unknown()) }).passthrough();

async function main(): Promise<void> {
  const connection = await discoverLcuConnection();
  if (!connection) {
    console.error('LCU unavailable: open the League client before running this command.');
    process.exitCode = 2;
    return;
  }

  const client = createLcuClient(connection);
  try {
    await client.get('/lol-gameflow/v1/gameflow-phase', phaseSchema);
    console.log('phase: available, schema compatible');
    const session = await client.get('/lol-gameflow/v1/session', sessionSchema);
    const participants = [...session.gameData.teamOne, ...session.gameData.teamTwo];
    console.log(`participants: available, schema compatible (${participants.length} redacted players)`);
    const playerId = String(participants[0].summonerId);
    await client.get(
      `/lol-match-history/v1/products/lol/${encodeURIComponent(playerId)}/matches?begIndex=0&endIndex=20`,
      historySchema
    );
    console.log('history: available, schema compatible (contents redacted)');
  } catch (error) {
    console.error(`LCU smoke failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    process.exitCode = 1;
  }
}

void main();

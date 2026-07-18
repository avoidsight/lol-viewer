import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { discoverLcuConnection, type LcuConnection } from '../src/main/lcu/discovery';
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

type SafeCode = 'LCU_UNAVAILABLE' | 'LCU_AUTH' | 'LCU_INVALID_RESPONSE' | 'PREREQUISITE_UNAVAILABLE';
type Endpoint = 'phase' | 'participants' | 'history';

export interface SmokeClient {
  get(path: string, schema: z.ZodTypeAny): Promise<unknown>;
}

interface SmokeDependencies {
  discover?: () => Promise<LcuConnection | null>;
  createClient?: (connection: LcuConnection) => SmokeClient;
  write: (line: string) => void;
}

function safeCode(error: unknown): SafeCode {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === 'LCU_UNAVAILABLE' || code === 'LCU_AUTH' || code === 'LCU_INVALID_RESPONSE') return code;
  return 'LCU_INVALID_RESPONSE';
}

function resultLine(endpoint: Endpoint, code?: SafeCode): string {
  return code ? `${endpoint}: unavailable-or-incompatible [${code}]` : `${endpoint}: compatible`;
}

export async function runLcuSmoke(dependencies: SmokeDependencies): Promise<0 | 1 | 2> {
  let connection: LcuConnection | null;
  try {
    connection = await (dependencies.discover ?? discoverLcuConnection)();
  } catch {
    connection = null;
  }
  if (!connection) {
    for (const endpoint of ['phase', 'participants', 'history'] as const) {
      dependencies.write(resultLine(endpoint, 'LCU_UNAVAILABLE'));
    }
    return 2;
  }

  let client: SmokeClient;
  try {
    client = (dependencies.createClient ?? createLcuClient)(connection);
  } catch {
    for (const endpoint of ['phase', 'participants', 'history'] as const) {
      dependencies.write(resultLine(endpoint, 'LCU_UNAVAILABLE'));
    }
    return 2;
  }
  let failed = false;
  try {
    await client.get('/lol-gameflow/v1/gameflow-phase', phaseSchema);
    dependencies.write(resultLine('phase'));
  } catch (error) {
    failed = true;
    dependencies.write(resultLine('phase', safeCode(error)));
  }

  let playerId: string | undefined;
  try {
    const rawSession = await client.get('/lol-gameflow/v1/session', sessionSchema);
    const session = sessionSchema.parse(rawSession);
    playerId = String([...session.gameData.teamOne, ...session.gameData.teamTwo][0].summonerId);
    dependencies.write(resultLine('participants'));
  } catch (error) {
    failed = true;
    dependencies.write(resultLine('participants', safeCode(error)));
  }

  if (!playerId) {
    failed = true;
    dependencies.write(resultLine('history', 'PREREQUISITE_UNAVAILABLE'));
  } else {
    try {
      await client.get(
        `/lol-match-history/v1/products/lol/${encodeURIComponent(playerId)}/matches?begIndex=0&endIndex=20`,
        historySchema
      );
      dependencies.write(resultLine('history'));
    } catch (error) {
      failed = true;
      dependencies.write(resultLine('history', safeCode(error)));
    }
  }
  return failed ? 1 : 0;
}

async function main(): Promise<void> {
  process.exitCode = await runLcuSmoke({ write: (line) => console.log(line) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();

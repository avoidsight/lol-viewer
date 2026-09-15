import { z } from 'zod';
import { gameflowPhaseSchema, type GameflowSessionIdentity } from '../../shared/ipc';
import type { LcuClient } from './http-client';

const phasesWithSession = new Set(['ChampSelect', 'GameStart', 'InProgress', 'Reconnect']);
const gameflowSessionSchema = z.object({
  phase: z.string().min(1),
  gameData: z.object({ gameId: z.union([z.string(), z.number()]).optional() })
});

export async function readGameflowSessionIdentity(client: LcuClient): Promise<GameflowSessionIdentity> {
  let phase: string;
  try {
    phase = await client.get('/lol-gameflow/v1/gameflow-phase', gameflowPhaseSchema);
  } catch {
    return { phase: 'None' };
  }

  if (!phasesWithSession.has(phase)) return { phase };

  try {
    const session = await client.get('/lol-gameflow/v1/session', gameflowSessionSchema);
    return {
      phase: session.phase,
      ...(session.gameData.gameId === undefined ? {} : { gameId: String(session.gameData.gameId) })
    };
  } catch {
    // The session endpoint can briefly return 404 while the League client changes phase.
    return { phase };
  }
}

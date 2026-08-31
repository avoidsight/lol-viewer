import { discoverLcuConnection } from '../src/main/lcu/discovery';
import { createLcuClient } from '../src/main/lcu/http-client';
import { MatchService } from '../src/main/match/match-service';
import { createSgpClient } from '../src/main/sgp/sgp-client';

const connection = await discoverLcuConnection();
if (!connection) {
  console.log(JSON.stringify({ compatible: false, reason: 'client-unavailable' }));
  process.exitCode = 2;
} else {
  try {
    const lcu = createLcuClient(connection);
    const sgp = connection.region?.toUpperCase() === 'TENCENT' && connection.rsoPlatformId
      ? createSgpClient(lcu, connection.rsoPlatformId)
      : undefined;
    const match = await new MatchService(lcu, sgp ? { sgp } : {}).loadLiveMatch('all', () => undefined);
    const teams = Object.fromEntries([...new Set(match.players.map((player) => player.teamId))].map(
      (teamId) => [String(teamId), match.players.filter((player) => player.teamId === teamId).length]
    ));
    console.log(JSON.stringify({
      compatible: true,
      players: match.players.length,
      teams,
      localTeamKnown: match.localTeamId !== null,
      readyHistories: match.players.filter((player) => player.status === 'ready').length,
      protectedHistories: match.players.filter((player) => player.status === 'unavailable').length,
      namedPlayers: match.players.filter((player) => player.displayName !== '未知玩家' && player.displayName.trim().length > 0).length,
      queueId: match.queueId
    }));
  } catch (error) {
    console.log(JSON.stringify({ compatible: false, reason: (error as { code?: unknown })?.code ?? 'invalid-response' }));
    process.exitCode = 1;
  }
}

import type { Lane, PlayerSnapshot, QueueScope } from '../../../../shared/domain';
import type { LiveMatch } from '../../../../shared/ipc';
import PlayerCard from './PlayerCard';
import './live-match.css';

const lanes: Exclude<Lane, 'UNKNOWN'>[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
const orderedTeam = (players: PlayerSnapshot[], teamId: number): PlayerSnapshot[] => lanes.flatMap((lane) => players.filter((player) => player.teamId === teamId && player.lane === lane));

interface Props { match: LiveMatch; scope?: QueueScope; onScopeChange?: (scope: QueueScope) => void }

export default function LiveMatchPage({ match, scope = 'ranked-solo', onScopeChange }: Props) {
  const teamIds = [...new Set(match.players.map((player) => player.teamId))];
  return (
    <main className="live-match-page">
      <div className="live-match-page__toolbar"><h1>实时对局</h1><div className="scope-switch" role="group" aria-label="战绩模式"><button type="button" aria-pressed={scope === 'ranked-solo'} onClick={() => onScopeChange?.('ranked-solo')}>单双排</button><button type="button" aria-pressed={scope === 'all'} onClick={() => onScopeChange?.('all')}>全部模式</button></div></div>
      <div className="live-match-page__scroll" tabIndex={0} aria-label="双方对局比较"><div className="live-match-grid">
        <section className="team-row" role="group" aria-label="我方队伍">{orderedTeam(match.players, teamIds[0]).map((player) => <PlayerCard key={player.playerId} player={player} />)}</section>
        <section className="team-row" role="group" aria-label="敌方队伍">{orderedTeam(match.players, teamIds[1]).map((player) => <PlayerCard key={player.playerId} player={player} />)}</section>
      </div></div>
    </main>
  );
}

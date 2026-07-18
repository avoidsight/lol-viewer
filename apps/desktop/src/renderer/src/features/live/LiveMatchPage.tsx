import type { ReactNode } from 'react';
import type { Lane, PlayerSnapshot, QueueScope } from '../../../../shared/domain';
import type { LiveMatch } from '../../../../shared/ipc';
import PlayerCard from './PlayerCard';
import './live-match.css';

const lanes: Exclude<Lane, 'UNKNOWN'>[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
interface Slot { lane: Exclude<Lane, 'UNKNOWN'>; player?: PlayerSnapshot; uncertain: boolean; label?: string }

export function teamSlots(players: PlayerSnapshot[], reliable = true): Slot[] {
  if (!reliable) {
    return players.slice(0, 5).map((player, index) => ({
      lane: lanes[index], player, uncertain: false, label: `阵容 ${index + 1}`
    }));
  }
  const remaining = [...players];
  const slots: Slot[] = lanes.map((lane) => {
    const matches = remaining.filter((player) => player.lane === lane);
    if (matches.length !== 1) return { lane, uncertain: false };
    const player = matches[0]; remaining.splice(remaining.indexOf(player), 1);
    return { lane, player, uncertain: false };
  });
  for (const slot of slots) if (!slot.player && remaining.length) { slot.player = remaining.shift(); slot.uncertain = true; }
  return slots;
}

interface Props {
  match?: LiveMatch; players?: PlayerSnapshot[]; scope?: QueueScope;
  onScopeChange?: (scope: QueueScope) => void; notice?: ReactNode; showLaneDifferences?: boolean;
}

export default function LiveMatchPage({ match, players = [], scope = 'ranked-solo', onScopeChange, notice, showLaneDifferences = true }: Props) {
  const visiblePlayers = match?.players ?? players;
  const knownTeamIds = [...new Set(visiblePlayers.map((player) => player.teamId))];
  const progressiveLocal = visiblePlayers.find((player) => player.isLocalTeam)?.teamId;
  const localTeamId = match?.localTeamId === undefined ? progressiveLocal : match.localTeamId;
  const oriented = localTeamId !== undefined && localTeamId !== null;
  const positionOrderReliable = match?.positionOrderReliable ?? true;
  const teamIds: (number | undefined)[] = oriented
    ? [localTeamId, knownTeamIds.find((teamId) => teamId !== localTeamId)]
    : [knownTeamIds[0], knownTeamIds[1]];
  return <main className="live-match-page">
    <div className="live-match-page__toolbar"><h1>实时对局</h1><div className="scope-switch" role="group" aria-label="战绩模式"><button type="button" aria-pressed={scope === 'ranked-solo'} onClick={() => onScopeChange?.('ranked-solo')}>单双排</button><button type="button" aria-pressed={scope === 'all'} onClick={() => onScopeChange?.('all')}>全部模式</button></div></div>
    {notice}
    {!oriented && visiblePlayers.length > 0 && <p role="status">阵营方向无法确认</p>}
    <div className="live-match-page__scroll" style={{ overflowX: 'auto' }} tabIndex={0} aria-label="双方对局比较"><div className="live-match-grid" style={{ minWidth: 1050 }}>
      {teamIds.map((teamId, teamIndex) => <section key={teamIndex} className="team-row" role="group" aria-label={oriented ? (teamIndex === 0 ? '我方队伍' : '敌方队伍') : `队伍 ${teamIndex + 1}`}>
        {teamSlots(teamId === undefined ? [] : visiblePlayers.filter((player) => player.teamId === teamId), positionOrderReliable).map((slot) => slot.player
          ? <PlayerCard key={slot.player.playerId} player={slot.player} displayLane={slot.lane} displayLabel={slot.label} uncertain={positionOrderReliable && showLaneDifferences && slot.uncertain} />
          : <article key={slot.lane} className="player-card player-card--placeholder" data-testid="player-slot" data-lane={slot.lane} aria-label={`${slot.label ?? slot.lane} 玩家加载中`}><span>{slot.label ?? slot.lane}</span><p>玩家加载中…</p></article>)}
      </section>)}
    </div></div>
  </main>;
}

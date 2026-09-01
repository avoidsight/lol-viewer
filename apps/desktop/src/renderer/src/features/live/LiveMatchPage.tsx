import { useEffect, useState, type ReactNode } from 'react';
import type { Lane, PlayerSnapshot } from '../../../../shared/domain';
import type { LiveMatch } from '../../../../shared/ipc';
import { isRankedQueue } from '../../../../shared/queue';
import PlayerCard from './PlayerCard';
import type { LiveMatchStatus } from './live-match-state';
import './live-match.css';

const lanes: Exclude<Lane, 'UNKNOWN'>[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
interface Slot { lane: Exclude<Lane, 'UNKNOWN'>; player?: PlayerSnapshot; uncertain: boolean; label?: string }

export function teamSlots(players: PlayerSnapshot[], reliable: boolean): Slot[] {
  if (!reliable) return lanes.map((lane, index) => ({ lane, player: players[index], uncertain: false, label: `阵容 ${index + 1}` }));
  const remaining = [...players];
  const slots: Slot[] = lanes.map((lane) => {
    const matches = remaining.filter((player) => player.lane === lane);
    if (matches.length !== 1) return { lane, uncertain: false };
    const player = matches[0];
    remaining.splice(remaining.indexOf(player), 1);
    return { lane, player, uncertain: false };
  });
  for (const slot of slots) if (!slot.player && remaining.length) { slot.player = remaining.shift(); slot.uncertain = true; }
  return slots;
}

interface Props { match?: LiveMatch; players?: PlayerSnapshot[]; loadingProgress?: number; notice?: ReactNode; showLaneDifferences?: boolean; lifecycleStatus?: LiveMatchStatus; gameflowPhase?: string }
export type LiveHistoryScope = 'all' | 'ranked';

function statusLabel(status: LiveMatchStatus, phase: string | undefined): string {
  if (status === 'last-match') return '上一局记录';
  if (status === 'new-match-loading') return '新对局加载中';
  if (status === 'error') return '数据暂不可用';
  if (status === 'paused') return '游戏中已停止补全';
  if (phase === 'ChampSelect') return '英雄选择中';
  if (phase === 'GameStart') return '正在进入游戏';
  if (phase === 'InProgress' || phase === 'Reconnect') return '游戏进行中';
  if (status === 'loading') return '阵容加载中';
  return status === 'current' ? '当前对局' : '等待对局';
}

export default function LiveMatchPage({ match, players = [], loadingProgress, notice, showLaneDifferences = true, lifecycleStatus = match ? 'current' : 'waiting', gameflowPhase }: Props) {
  const [historyScope, setHistoryScope] = useState<LiveHistoryScope>(() =>
    match && isRankedQueue(match.queueId) ? 'ranked' : 'all');
  useEffect(() => {
    setHistoryScope(match && isRankedQueue(match.queueId) ? 'ranked' : 'all');
  }, [match?.queueId]);
  const visiblePlayers = match?.players ?? players;
  const knownTeamIds = [...new Set(visiblePlayers.map((player) => player.teamId))];
  const progressiveLocal = visiblePlayers.find((player) => player.isLocalTeam)?.teamId;
  const localTeamId = match?.localTeamId === undefined ? progressiveLocal : match.localTeamId;
  const oriented = localTeamId !== undefined && localTeamId !== null;
  const positionOrderReliable = match?.positionOrderReliable ?? false;
  const teamIds: (number | undefined)[] = oriented ? [localTeamId, knownTeamIds.find((teamId) => teamId !== localTeamId)] : [knownTeamIds[0], knownTeamIds[1]];

  return <main className="live-match-page">
    <div className="live-match-page__toolbar"><div><h1>对战信息</h1><span>实时 5v5 阵容</span></div><div className="live-match-page__controls"><span className="live-match-page__status" data-status={lifecycleStatus}>{statusLabel(lifecycleStatus, gameflowPhase)}</span><div className="live-match-page__scope-wrap"><div className="live-match-page__scope" role="group" aria-label="战绩范围"><button type="button" aria-pressed={historyScope === 'all'} onClick={() => setHistoryScope('all')}>全部对局</button><button type="button" aria-pressed={historyScope === 'ranked'} onClick={() => setHistoryScope('ranked')}>排位对局</button></div><span className="live-match-page__scope-caption">{historyScope === 'ranked' ? '从最近20场中筛选' : '统计最近20场'}</span></div>{match && <strong className="live-match-page__mode">{match.modeName}</strong>}</div></div>
    {notice}
    {loadingProgress !== undefined && <div className="live-match-page__progress" role="status" aria-label={`阵容加载进度 ${loadingProgress}/10`}><span>正在读取玩家战绩</span><strong>{loadingProgress}/10</strong><progress max={10} value={loadingProgress} /></div>}
    {!oriented && visiblePlayers.length > 0 && <p role="status">阵营方向无法确认</p>}
    {visiblePlayers.length > 0 && <div className="live-match-page__scroll" style={{ overflowX: 'auto' }} tabIndex={0} aria-label="双方对局比较"><div className="live-match-grid" style={{ minWidth: 1050 }}>
      {teamIds.map((teamId, teamIndex) => {
        const label = oriented ? (teamIndex === 0 ? '我方队伍' : '敌方队伍') : `队伍 ${teamIndex + 1}`;
        return <section key={teamIndex} className="team-panel" data-testid="team-roster" role="group" aria-label={label}>
          <header className="team-panel__header"><h2>{oriented ? (teamIndex === 0 ? '己方阵容' : '敌方阵容') : label}</h2><span>5 名玩家</span></header>
          <div className="team-row">
            {teamSlots(teamId === undefined ? [] : visiblePlayers.filter((player) => player.teamId === teamId), positionOrderReliable).map((slot) => slot.player
              ? <PlayerCard key={slot.player.playerId} player={slot.player} historyScope={historyScope} displayLane={slot.lane} displayLabel={slot.label} uncertain={positionOrderReliable && showLaneDifferences && slot.uncertain} />
              : <article key={slot.lane} className="player-card player-card--placeholder" data-testid="player-slot" data-lane={slot.lane} aria-label={`${slot.label ?? slot.lane} 玩家加载中`}><span>{slot.label ?? slot.lane}</span><p>玩家加载中…</p></article>)}
          </div>
        </section>;
      })}
    </div></div>}
  </main>;
}

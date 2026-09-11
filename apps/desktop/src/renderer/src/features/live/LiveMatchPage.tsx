import { useEffect, useState, type ReactNode } from 'react';
import type { Lane, PlayerSnapshot } from '../../../../shared/domain';
import type { LiveMatch } from '../../../../shared/ipc';
import { isRankedQueue } from '../../../../shared/queue';
import PlayerCard, { HistorySkeleton, unavailableLabels } from './PlayerCard';
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
  const [viewMode, setViewMode] = useState<'detail' | 'overview'>('detail');
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

  return <main className="live-match-page" data-view-mode={viewMode}>
    <header className="live-match-page__toolbar">
      <h1 className="player-card__sr-only">对战信息</h1>
      <div className="live-match-page__meta">
        {match && <strong className="live-match-page__mode">{match.modeName}</strong>}
        <span className="live-match-page__status" data-status={lifecycleStatus}><i aria-hidden="true" />{statusLabel(lifecycleStatus, gameflowPhase)}</span>
        {!oriented && visiblePlayers.length > 0 && <span className="live-match-page__orientation" role="status" aria-label="阵营方向无法确认" title="阵营方向无法确认">?</span>}
      </div>
      <div className="live-match-page__controls">
      <div className="live-match-page__scope" role="group" aria-label="显示方式">
        <button type="button" aria-pressed={viewMode === 'detail'} onClick={() => setViewMode('detail')}>详细</button>
        <button type="button" title="左列最近第 1–5 场，右列第 6–10 场；悬停查看详情" aria-pressed={viewMode === 'overview'} onClick={() => setViewMode('overview')}>总览</button>
      </div>
      <div className="live-match-page__scope" role="group" aria-label="战绩范围">
        <button type="button" aria-label="全部对局" title="全部对局" aria-pressed={historyScope === 'all'} onClick={() => setHistoryScope('all')}><i className="is-all" aria-hidden="true" />全部</button>
        <button type="button" aria-label="排位对局" title="排位对局" aria-pressed={historyScope === 'ranked'} onClick={() => setHistoryScope('ranked')}><i className="is-ranked" aria-hidden="true" />排位</button>
      </div>
      </div>
    </header>
    {notice && <div className={`live-match-page__notice-wrap${visiblePlayers.length > 0 ? ' is-inline' : ''}`}>{notice}</div>}
    {loadingProgress !== undefined && <div className="live-match-page__progress" role="status" aria-label={`阵容加载进度 ${loadingProgress}/10`}><strong>{loadingProgress}<small>/10</small></strong><div className="live-match-page__loading-slots" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => { const loadedPlayer = players[index]; return <span key={index} className={loadedPlayer ? 'is-loaded' : index === loadingProgress ? 'is-loading' : ''}>{loadedPlayer?.championId ? <img src={`lol-asset://champion-icons/${loadedPlayer.championId}.png`} alt="" /> : loadedPlayer ? <b>✓</b> : <i />}</span>; })}</div><progress max={10} value={loadingProgress} /></div>}
    {visiblePlayers.length > 0 && <div className="live-match-page__scroll" tabIndex={0} aria-label="双方对局比较"><div className="live-match-grid">
      {teamIds.map((teamId, teamIndex) => {
        const label = oriented ? (teamIndex === 0 ? '我方队伍' : '敌方队伍') : `队伍 ${teamIndex + 1}`;
        const side = oriented ? (teamIndex === 0 ? 'ally' : 'enemy') : 'neutral';
        const slots = teamSlots(teamId === undefined ? [] : visiblePlayers.filter((player) => player.teamId === teamId), positionOrderReliable);
        const failed = slots.filter(slot => slot.player?.status === 'unavailable');
        const groupedError = failed.length > 1 && failed.every(slot => slot.player?.errorCode === failed[0].player?.errorCode);
        return <section key={teamIndex} className={`team-panel team-panel--${side}`} data-testid="team-roster" role="group" aria-label={label}>
          <header className="team-panel__header"><h2><i aria-hidden="true" />{oriented ? (teamIndex === 0 ? '己方' : '敌方') : label}</h2>{groupedError && <span className="team-panel__error" role="status" title={unavailableLabels[failed[0].player?.errorCode ?? 'UNKNOWN']}>战绩暂不可用 · {failed.length}人</span>}</header>
          <div className="team-row">
            {/* LCU may repeat a player ID; include the unique roster slot to avoid orphaned cards on mode changes. */}
            {slots.map((slot) => slot.player
              ? <PlayerCard key={slot.lane} player={slot.player} overview={viewMode === 'overview'} groupedError={groupedError} historyScope={historyScope} displayLane={slot.lane} displayLabel={slot.label} uncertain={positionOrderReliable && showLaneDifferences && slot.uncertain} />
              : <article key={slot.lane} className="player-card player-card--placeholder" data-testid="player-slot" data-lane={slot.lane} aria-label="玩家加载中"><header className="player-card__placeholder-header"><span className="player-card__champion-static" aria-hidden="true">◇</span><strong>等待玩家信息</strong></header><HistorySkeleton overview={viewMode === 'overview'} /></article>)}
          </div>
        </section>;
      })}
    </div></div>}
  </main>;
}

import { useEffect, useId, useState } from 'react';
import type { PlayerSnapshot } from '../../../../shared/domain';
import { localizeRank } from '../../../../shared/rank';
import { isRankedQueue } from '../../../../shared/queue';
import bottomLaneIcon from '../../assets/positions/position-bottom-light.svg';
import jungleLaneIcon from '../../assets/positions/position-jungle-light.svg';
import middleLaneIcon from '../../assets/positions/position-middle-light.svg';
import topLaneIcon from '../../assets/positions/position-top-light.svg';
import utilityLaneIcon from '../../assets/positions/position-utility-light.svg';
import type { LiveHistoryScope } from './LiveMatchPage';
import RecentMatch from './RecentMatch';

const laneNames = { TOP: '上路', JUNGLE: '打野', MIDDLE: '中路', BOTTOM: '下路', UTILITY: '辅助', UNKNOWN: '未知位置' } as const;
const laneIcons = { TOP: topLaneIcon, JUNGLE: jungleLaneIcon, MIDDLE: middleLaneIcon, BOTTOM: bottomLaneIcon, UTILITY: utilityLaneIcon } as const;
const championIconUrl = (_version: string | undefined, championId: number) =>
  `lol-asset://champion-icons/${championId}.png`;
export const unavailableLabels = {
  PRIVACY_RESTRICTED: '该玩家战绩受隐私保护',
  CLIENT_UNAVAILABLE: '客户端连接中断，暂时无法读取',
  DATA_SERVICE_UNAVAILABLE: '战绩服务暂时不可用',
  INVALID_RESPONSE: '战绩数据格式异常',
  UNKNOWN: '战绩暂时无法读取'
} as const;

export function HistorySkeleton({ overview = false }: { overview?: boolean }) {
  return <div className="player-card__state player-card__skeleton" role="status" aria-label="正在加载战绩"><span className="player-card__sr-only">正在加载战绩…</span>{Array.from({ length: overview ? 10 : 5 }, (_, index) => <div className="player-card__skeleton-row" key={index} aria-hidden="true"><i /><span><i /><i /></span></div>)}</div>;
}

export default function PlayerCard({ player, overview = false, groupedError = false, historyScope = 'all', displayLane = player.lane, displayLabel, uncertain = false }: { player: PlayerSnapshot; overview?: boolean; groupedError?: boolean; historyScope?: LiveHistoryScope; displayLane?: keyof typeof laneNames; displayLabel?: string; uncertain?: boolean }) {
  const identityId = useId();
  const [championImageUnavailable, setChampionImageUnavailable] = useState(false);
  useEffect(() => setChampionImageUnavailable(false), [player.championId]);
  const championIcon = player.championId > 0 ? championIconUrl(player.assetVersion, player.championId) : undefined;
  const scopedMatches = player.matches.filter((match) => historyScope === 'all' || isRankedQueue(match.queueId));
  const visibleMatches = scopedMatches.slice(0, 10);
  const wins = visibleMatches.filter((match) => match.win).length;
  const championMatches = visibleMatches.filter((match) => match.championId === player.championId);
  const championWins = championMatches.filter((match) => match.win).length;
  const laneLabel = displayLabel ?? laneNames[displayLane];
  const laneIcon = displayLabel || displayLane === 'UNKNOWN' ? undefined : laneIcons[displayLane];
  const championSummary = player.status === 'ready' && player.championId > 0
    ? `近 ${visibleMatches.length} 场${historyScope === 'ranked' ? '排位' : ''}中使用该英雄 ${championMatches.length} 场，${championWins}胜${championMatches.length - championWins}负（非赛季统计）`
    : undefined;
  return <article className="player-card" data-testid="player-card" data-history-state={player.status} data-lane={displayLane} aria-labelledby={identityId}>
    <header className="player-card__header">
      {championIcon && !championImageUnavailable
        ? <img className="player-card__champion" src={championIcon} title={championSummary} alt={`当前英雄 ${player.championId}`} onError={() => setChampionImageUnavailable(true)} />
        : championIcon
          ? <span className="player-card__champion player-card__champion--fallback player-card__champion--unavailable" role="img" title={championSummary} aria-label={`当前英雄 ${player.championId}图标不可用`}><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M10 27c1-7 4-11 10-11s9 4 10 11" /><circle cx="20" cy="12" r="6" /><path d="m11 10 4-7 5 5 5-5 4 7" /></svg><b>{player.championId}</b></span>
          : <span className="player-card__champion player-card__champion--fallback" role="img" aria-label={player.status === 'unavailable' ? '英雄信息暂不可用' : '英雄选择中'}><span className="player-card__champion-static" aria-hidden="true">◇</span></span>}
      <div className="player-card__identity">
        {laneIcon && <span className="player-card__lane" aria-label={laneLabel} title={laneLabel}><img src={laneIcon} alt="" aria-hidden="true" /></span>}
        <h3 id={identityId} title={player.displayName}>{player.displayName}</h3>
        <span className="player-card__rank">{localizeRank(player.rank) ?? '段位未知'}</span>
        {player.status === 'ready' && <span className="player-card__recent-record" role="group" aria-label={`近 ${visibleMatches.length} 场，${wins}胜${visibleMatches.length - wins}负`}>
          {visibleMatches.length ? `${wins}胜${visibleMatches.length - wins}负` : '暂无战绩'}
        </span>}
        {uncertain && <span className="player-card__uncertain" role="img" aria-label="位置待确认" title="位置待确认">?</span>}
      </div>
    </header>
    {player.status === 'loading'
      ? <HistorySkeleton overview={overview} />
      : player.status === 'unavailable'
        ? <div className="player-card__state player-card__state--private" role="status" aria-label={groupedError ? '战绩暂不可用' : undefined}><span className="player-card__empty-icon" aria-hidden="true">—</span>{!groupedError && <span>{player.errorCode ? unavailableLabels[player.errorCode] : '战绩暂时无法读取'}</span>}</div>
        : <>
          <ol className="player-card__matches" tabIndex={!overview && visibleMatches.length > 4 ? 0 : undefined} aria-label={`${player.displayName}${historyScope === 'ranked' ? '最近排位对局' : '最近对局'}`}>{visibleMatches.map((match) => <RecentMatch key={match.matchId} compact={overview} match={match} assetVersion={player.assetVersion} itemIconPaths={player.itemIconPaths} />)}</ol>
        </>}
  </article>;
}

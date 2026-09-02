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
const laneGlyphs = { TOP: '↖', JUNGLE: '✦', MIDDLE: '◆', BOTTOM: '↘', UTILITY: '✚', UNKNOWN: '?' } as const;
const laneIcons = { TOP: topLaneIcon, JUNGLE: jungleLaneIcon, MIDDLE: middleLaneIcon, BOTTOM: bottomLaneIcon, UTILITY: utilityLaneIcon } as const;
const percent = (value: number): string => `${Math.round(value * 100)}%`;
const championIconUrl = (_version: string | undefined, championId: number) =>
  `lol-asset://champion-icons/${championId}.png`;
const unavailableLabels = {
  PRIVACY_RESTRICTED: '该玩家战绩受隐私保护',
  CLIENT_UNAVAILABLE: '客户端连接中断，暂时无法读取',
  DATA_SERVICE_UNAVAILABLE: '战绩服务暂时不可用',
  INVALID_RESPONSE: '战绩数据格式异常',
  UNKNOWN: '战绩暂时无法读取'
} as const;

export default function PlayerCard({ player, historyScope = 'all', displayLane = player.lane, displayLabel, uncertain = false }: { player: PlayerSnapshot; historyScope?: LiveHistoryScope; displayLane?: keyof typeof laneNames; displayLabel?: string; uncertain?: boolean }) {
  const championIcon = player.championId > 0 ? championIconUrl(player.assetVersion, player.championId) : undefined;
  const scopedMatches = player.matches.filter((match) => historyScope === 'all' || isRankedQueue(match.queueId));
  const visibleMatches = scopedMatches.slice(0, 10);
  const wins = scopedMatches.filter((match) => match.win).length;
  const championMatches = scopedMatches.filter((match) => match.championId === player.championId);
  const championWins = championMatches.filter((match) => match.win).length;
  const laneLabel = displayLabel ?? laneNames[displayLane];
  const laneGlyph = displayLabel?.match(/\d+/)?.[0] ?? laneGlyphs[displayLane];
  const laneIcon = displayLabel || displayLane === 'UNKNOWN' ? undefined : laneIcons[displayLane];
  const sampleRate = scopedMatches.length ? wins / scopedMatches.length : 0;
  const championRate = championMatches.length ? championWins / championMatches.length : undefined;
  return <article className="player-card" data-testid="player-card" data-history-state={player.status} data-lane={displayLane} aria-labelledby={`player-${player.playerId}`}>
    <header className="player-card__header">
      {championIcon
        ? <img className="player-card__champion" src={championIcon} alt={`当前英雄 ${player.championId}`} />
        : <span className="player-card__champion player-card__champion--fallback" role="img" aria-label="英雄选择中"><span className="player-card__champion-spinner" aria-hidden="true" /></span>}
      <div className="player-card__identity">
        <span className="player-card__lane" aria-label={laneLabel} title={laneLabel}>{laneIcon ? <img src={laneIcon} alt="" aria-hidden="true" /> : laneGlyph}</span>
        <h3 id={`player-${player.playerId}`}>{player.displayName}</h3>
        <span className="player-card__rank">{localizeRank(player.rank) ?? '段位未知'}</span>
        {uncertain && <span className="player-card__uncertain" role="img" aria-label="位置待确认" title="位置待确认">?</span>}
      </div>
      {player.status === 'ready' && <div className="player-card__summary" role="group" aria-label={`战绩样本 ${scopedMatches.length} 场，胜率 ${percent(sampleRate)}；当前英雄 ${championMatches.length} 场，胜率 ${championRate === undefined ? '暂无' : percent(championRate)}`}>
        <div className="player-card__metric player-card__metric--sample" title={`样本胜率 · ${scopedMatches.length} 场`}><i aria-hidden="true" /><strong>{percent(sampleRate)}</strong><small>{scopedMatches.length}场</small></div>
        <div className="player-card__metric player-card__metric--champion" title={`当前英雄胜率 · ${championMatches.length} 场`}><i aria-hidden="true" /><strong>{championRate === undefined ? '—' : percent(championRate)}</strong><small>{championMatches.length}场</small></div>
      </div>}
    </header>
    {player.status === 'loading'
      ? <div className="player-card__state player-card__skeleton" role="status" aria-label="正在加载战绩"><span className="player-card__sr-only">正在加载战绩…</span><i /><i /><i /><i /></div>
      : player.status === 'unavailable'
        ? <p className="player-card__state player-card__state--private" role="status">{player.errorCode ? unavailableLabels[player.errorCode] : '战绩暂时无法读取'}</p>
        : <>
          <ol className="player-card__matches" tabIndex={visibleMatches.length > 5 ? 0 : undefined} aria-label={`${player.displayName}${historyScope === 'ranked' ? '最近排位对局' : '最近对局'}`}>{visibleMatches.map((match) => <RecentMatch key={match.matchId} match={match} assetVersion={player.assetVersion} />)}</ol>
        </>}
  </article>;
}

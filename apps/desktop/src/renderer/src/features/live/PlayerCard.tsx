import type { PlayerSnapshot } from '../../../../shared/domain';
import { localizeRank } from '../../../../shared/rank';
import { isRankedQueue } from '../../../../shared/queue';
import type { LiveHistoryScope } from './LiveMatchPage';
import RecentMatch from './RecentMatch';

const laneNames = { TOP: '上路', JUNGLE: '打野', MIDDLE: '中路', BOTTOM: '下路', UTILITY: '辅助', UNKNOWN: '未知位置' } as const;
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
  const sampleNotice = historyScope === 'ranked'
    ? `最近 ${player.matches.length} 场中筛出 ${scopedMatches.length} 场排位${scopedMatches.length > 10 ? ' · 列表展示 10 场' : ''}`
    : player.matches.length < 10
      ? `最近战绩仅获取到 ${player.matches.length}/20 场`
      : `统计最近 ${player.matches.length} 场 · 列表展示 10 场`;
  return <article className="player-card" data-testid="player-card" data-history-state={player.status} data-lane={displayLane} aria-labelledby={`player-${player.playerId}`}>
    <header className="player-card__header">
      {championIcon
        ? <img className="player-card__champion" src={championIcon} alt={`当前英雄 ${player.championId}`} />
        : <span className="player-card__champion player-card__champion--fallback" role="img" aria-label="英雄选择中"><span className="player-card__champion-spinner" aria-hidden="true" /></span>}
      <div className="player-card__identity">
        <span className="player-card__lane">{displayLabel ?? laneNames[displayLane]}</span>
        <h3 id={`player-${player.playerId}`}>{player.displayName}</h3>
        <span className="player-card__rank">{localizeRank(player.rank) ?? '段位未知'}</span>
        {uncertain && <span className="player-card__uncertain">位置待确认</span>}
      </div>
    </header>
    {player.status === 'loading'
      ? <p className="player-card__state" role="status">正在加载战绩…</p>
      : player.status === 'unavailable'
        ? <p className="player-card__state player-card__state--private" role="status">{player.errorCode ? unavailableLabels[player.errorCode] : '战绩暂时无法读取'}</p>
        : <>
          <dl className="player-card__summary"><div><dt>近20场样本</dt><dd>{scopedMatches.length} 场</dd></div><div><dt>样本胜率</dt><dd>{percent(scopedMatches.length ? wins / scopedMatches.length : 0)}</dd></div><div><dt>该英雄胜率</dt><dd>{championMatches.length} 场 / {percent(championMatches.length ? championWins / championMatches.length : 0)}</dd></div></dl>
          <p className="player-card__notice">{sampleNotice}</p>
          <ol className="player-card__matches" tabIndex={visibleMatches.length > 5 ? 0 : undefined} aria-label={`${player.displayName}${historyScope === 'ranked' ? '最近排位对局' : '最近对局'}`}>{visibleMatches.map((match) => <RecentMatch key={match.matchId} match={match} assetVersion={player.assetVersion} />)}</ol>
        </>}
  </article>;
}

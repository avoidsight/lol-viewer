import type { PlayerSnapshot } from '../../../../shared/domain';
import RecentMatch from './RecentMatch';

const laneNames = { TOP: '上路', JUNGLE: '打野', MIDDLE: '中路', BOTTOM: '下路', UTILITY: '辅助', UNKNOWN: '未知位置' } as const;
const percent = (value: number): string => `${Math.round(value * 100)}%`;

export default function PlayerCard({ player }: { player: PlayerSnapshot }) {
  return (
    <article className="player-card" data-testid="player-card" data-lane={player.lane} aria-labelledby={`player-${player.playerId}`}>
      <header className="player-card__header"><span className="player-card__lane">{laneNames[player.lane]}</span><h3 id={`player-${player.playerId}`}>{player.displayName}</h3><span>{player.rank ?? '段位未知'}</span></header>
      {player.status === 'loading' ? <p className="player-card__state" role="status">正在加载战绩…</p> : player.status === 'unavailable' ?
        <p className="player-card__state" role="status">战绩暂不可用{player.error ? `：${player.error}` : ''}</p> : <>
          <dl className="player-card__summary"><div><dt>样本</dt><dd>{player.sampleSize} 场</dd></div><div><dt>胜率</dt><dd>{percent(player.winRate)}</dd></div><div><dt>当前英雄</dt><dd>{player.currentChampionGames} 场 / {percent(player.currentChampionWinRate)}</dd></div></dl>
          {player.matches.length < 10 && <p className="player-card__notice">仅获取到 {player.matches.length}/10 场</p>}
          <ol className="player-card__matches" aria-label={`${player.displayName}最近对局`}>{player.matches.slice(0, 10).map((match) => <RecentMatch key={match.matchId} match={match} />)}</ol>
        </>}
    </article>
  );
}

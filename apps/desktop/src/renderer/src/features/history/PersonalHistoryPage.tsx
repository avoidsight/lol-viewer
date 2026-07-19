import type { MatchSummary, PersonalHistorySnapshot } from '../../../../shared/domain';
import { describeQueue } from '../../../../shared/queue';
import './personal-history.css';

type HistoryState = 'loading' | 'ready' | 'unavailable';

const iconUrl = (version: string | undefined, championId: number) =>
  `https://raw.communitydragon.org/${encodeURIComponent(version ?? 'latest')}/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`;

function MatchRow({ match, assetVersion }: { match: MatchSummary; assetVersion?: string }) {
  return <article data-testid="personal-match" className={match.win ? 'is-win' : 'is-loss'}>
    <img src={iconUrl(assetVersion, match.championId)} alt={`英雄 ${match.championId}`} loading="lazy" />
    <strong>{match.win ? '胜利' : '失败'}</strong>
    <span>{describeQueue(match.queueId)}</span>
    <span aria-label="KDA">{match.kills} / {match.deaths} / {match.assists}</span>
  </article>;
}

export default function PersonalHistoryPage({ snapshot, state }: {
  snapshot?: PersonalHistorySnapshot;
  state: HistoryState;
}) {
  if (state === 'loading') {
    return <main className="personal-history"><p role="status">正在加载个人战绩…</p></main>;
  }
  if (state === 'unavailable' || !snapshot) {
    return <main className="personal-history"><p role="alert">请先启动英雄联盟客户端</p></main>;
  }

  return <main className="personal-history">
    <header className="personal-history__identity">
      <div><h1>{snapshot.displayName}</h1><p>{snapshot.rank ?? '未定级'}</p></div>
      {snapshot.cached && <strong className="personal-history__cached">缓存数据</strong>}
    </header>
    <section aria-labelledby="history-summary">
      <h2 id="history-summary">最近 20 场</h2>
      <dl className="personal-history__summary">
        <div><dt>胜场</dt><dd>{snapshot.wins}</dd></div>
        <div><dt>负场</dt><dd>{snapshot.losses}</dd></div>
        <div><dt>胜率</dt><dd>{(snapshot.winRate * 100).toFixed(1)}%</dd></div>
        <div><dt>平均 KDA</dt><dd>{snapshot.averageKda.toFixed(2)}</dd></div>
      </dl>
    </section>
    <section aria-labelledby="favorite-champions">
      <h2 id="favorite-champions">常用英雄</h2>
      <div className="personal-history__favorites">
        {snapshot.favoriteChampions.slice(0, 5).map(champion => <article data-testid="favorite-champion" key={champion.championId}>
          <img src={iconUrl(snapshot.assetVersion, champion.championId)} alt={`英雄 ${champion.championId}`} loading="lazy" />
          <p>{champion.games} 场 · {(champion.winRate * 100).toFixed(1)}%</p>
        </article>)}
      </div>
    </section>
    <section aria-label="比赛记录" className="personal-history__matches">
      {snapshot.matches.slice(0, 20).map(match => <MatchRow key={match.matchId} match={match} assetVersion={snapshot.assetVersion} />)}
    </section>
  </main>;
}

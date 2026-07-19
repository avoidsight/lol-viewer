import type { MatchSummary, PersonalHistorySnapshot } from '../../../../shared/domain';
import { describeQueue } from '../../../../shared/queue';
import './personal-history.css';

type HistoryState = 'loading' | 'ready' | 'unavailable';

const championIconUrl = (version: string | undefined, championId: number) =>
  `https://raw.communitydragon.org/${encodeURIComponent(version ?? 'latest')}/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${championId}.png`;

const profileIconUrl = (version: string | undefined, profileIconId: number) =>
  `https://raw.communitydragon.org/${encodeURIComponent(version ?? 'latest')}/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${profileIconId}.jpg`;

function MatchRow({ match, assetVersion }: { match: MatchSummary; assetVersion?: string }) {
  return <article data-testid="personal-match" className={match.win ? 'is-win' : 'is-loss'}>
    <img src={championIconUrl(assetVersion, match.championId)} alt={`英雄 ${match.championId}`} loading="lazy" />
    <div className="personal-history__match-result">
      <strong>{match.win ? '胜利' : '失败'}</strong>
      <span>{describeQueue(match.queueId)}</span>
    </div>
    <span className="personal-history__match-kda" aria-label="KDA">
      <b>{match.kills}</b><i>/</i><b className="is-death">{match.deaths}</b><i>/</i><b>{match.assists}</b>
    </span>
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
    <div className="personal-history__inner">
      <header className="personal-history__hero">
        <img className="personal-history__hero-avatar" src={profileIconUrl(snapshot.assetVersion, snapshot.profileIconId)} alt={`${snapshot.displayName}头像`} />
        <div className="personal-history__identity">
          <div className="personal-history__name-row">
            <h1>{snapshot.displayName}</h1>
            {snapshot.cached && <strong className="personal-history__cached">缓存数据</strong>}
          </div>
          <p>{snapshot.rank ?? '未定级'}</p>
        </div>
        <p className="personal-history__hero-summary"><strong>最近 {snapshot.sampleSize} 场</strong><span>{snapshot.wins} 胜 {snapshot.losses} 负 · {(snapshot.winRate * 100).toFixed(1)}%</span></p>
      </header>

      <section aria-labelledby="history-summary">
        <h2 id="history-summary">数据概览</h2>
        <dl className="personal-history__summary">
          <div className="personal-history__kpi"><dt>胜场</dt><dd>{snapshot.wins}</dd></div>
          <div className="personal-history__kpi"><dt>负场</dt><dd>{snapshot.losses}</dd></div>
          <div className="personal-history__kpi personal-history__kpi--primary"><dt>胜率</dt><dd>{(snapshot.winRate * 100).toFixed(1)}%</dd></div>
          <div className="personal-history__kpi"><dt>平均 KDA</dt><dd>{snapshot.averageKda.toFixed(2)}</dd></div>
        </dl>
      </section>

      <div className="personal-history__content">
        <section className="personal-history__panel personal-history__favorites-panel" aria-labelledby="favorite-champions">
          <h2 id="favorite-champions">常用英雄</h2>
          <div className="personal-history__favorites">
            {snapshot.favoriteChampions.slice(0, 5).map(champion => <article data-testid="favorite-champion" key={champion.championId}>
              <img src={championIconUrl(snapshot.assetVersion, champion.championId)} alt={`英雄 ${champion.championId}`} loading="lazy" />
              <div><strong>{champion.games} 场</strong><p>{(champion.winRate * 100).toFixed(1)}% 胜率</p></div>
              <span className="personal-history__winrate-bar" aria-hidden="true"><i style={{ width: `${champion.winRate * 100}%` }} /></span>
            </article>)}
          </div>
        </section>

        <section className="personal-history__panel personal-history__matches-panel" aria-labelledby="recent-matches">
          <h2 id="recent-matches">最近对局</h2>
          <div className="personal-history__matches">
            {snapshot.matches.slice(0, 20).map(match => <MatchRow key={match.matchId} match={match} assetVersion={snapshot.assetVersion} />)}
          </div>
        </section>
      </div>
    </div>
  </main>;
}

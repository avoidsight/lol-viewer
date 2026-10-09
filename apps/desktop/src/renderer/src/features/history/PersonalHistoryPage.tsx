import { useEffect, useMemo, useState } from 'react';
import type { PersonalHistorySnapshot } from '../../../../shared/domain';
import type { PersonalHistoryTarget } from '../../../../shared/ipc';
import { localizeRank } from '../../../../shared/rank';
import { isRankedQueue } from '../../../../shared/queue';
import './personal-history.css';
import HistoryWorkspace from './HistoryWorkspace';

type HistoryState = 'loading' | 'ready' | 'unavailable';
type HistoryQueueScope = 'all' | 'ranked';
type HistoryResultScope = 'all' | 'wins' | 'losses';

const championIconUrl = (_version: string | undefined, championId: number) =>
  `lol-asset://champion-icons/${championId}.png`;

const profileIconUrl = (_version: string | undefined, profileIconId: number) =>
  `lol-asset://profile-icons/${profileIconId}.jpg`;

export default function PersonalHistoryPage({ snapshot, state, onRefresh, onPlayerSelect, onBack, refreshing = false, refreshError = '' }: {
  snapshot?: PersonalHistorySnapshot;
  state: HistoryState;
  onRefresh?: () => void;
  onPlayerSelect?: (target: PersonalHistoryTarget) => void;
  onBack?: () => void;
  refreshing?: boolean;
  refreshError?: string;
}) {
  const [queueScope, setQueueScope] = useState<HistoryQueueScope>('all');
  const [resultScope, setResultScope] = useState<HistoryResultScope>('all');
  useEffect(() => {
    setQueueScope('all');
    setResultScope('all');
  }, [snapshot?.playerId]);
  const filteredMatches = useMemo(() => (snapshot?.matches ?? []).slice(0, 20)
    .filter((match) => queueScope === 'all' || isRankedQueue(match.queueId))
    .filter((match) => resultScope === 'all' || (resultScope === 'wins' ? match.win : !match.win)), [queueScope, resultScope, snapshot?.matches]);

  if (state === 'loading') {
    return <main className="personal-history"><div className="personal-history__inner"><div className="personal-history__unavailable"><p role="status">正在加载个人战绩…</p></div></div></main>;
  }
  if (state === 'unavailable' || !snapshot) {
    return <main className="personal-history"><div className="personal-history__inner"><div className="personal-history__unavailable"><p role="alert">{onBack ? '该玩家战绩暂时无法读取' : '请先启动英雄联盟客户端'}</p></div></div></main>;
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
          <p>{localizeRank(snapshot.rank) ?? '未定级'} · 最近 {snapshot.sampleSize} 场</p>
        </div>
        <div className="personal-history__summary">
          <div className="personal-history__win-rate"><strong>{(snapshot.winRate * 100).toFixed(1)}%</strong><span>胜率</span></div>
          <div className="personal-history__record" aria-label={`${snapshot.wins} 胜 ${snapshot.losses} 负`}>
            <div><strong>{snapshot.wins} 胜</strong><strong>{snapshot.losses} 负</strong></div>
            <span aria-hidden="true"><i style={{ width: `${snapshot.winRate * 100}%` }} /><i style={{ width: `${(1 - snapshot.winRate) * 100}%` }} /></span>
          </div>
          <div className="personal-history__average-kda"><strong>{snapshot.averageKda.toFixed(2)}</strong><span>平均 KDA</span></div>
        </div>
        <div className="personal-history__refresh">
          <button type="button" aria-label={refreshing ? '刷新中' : '刷新'} title={refreshing ? '刷新中' : '刷新战绩'} onClick={onRefresh} disabled={refreshing}><span aria-hidden="true">↻</span></button>
          {refreshError && <span aria-live="polite">{refreshError}</span>}
        </div>
      </header>

      <section className="personal-history__quickbar" aria-labelledby="favorite-champions">
        <div className="personal-history__favorites">
          <h2 id="favorite-champions">常用</h2>
          {snapshot.favoriteChampions.slice(0, 5).map((champion) => <article data-testid="favorite-champion" key={champion.championId} title={`${champion.games} 场，胜率 ${(champion.winRate * 100).toFixed(1)}%`}>
            <img src={championIconUrl(snapshot.assetVersion, champion.championId)} alt={`英雄 ${champion.championId}`} loading="lazy" />
            <div><strong>{champion.games} 场</strong><span>胜率 {(champion.winRate * 100).toFixed(1)}%</span></div>
          </article>)}
        </div>
        <div className="personal-history__filters">
          <div role="group" aria-label="对局类型">
            <button type="button" aria-pressed={queueScope === 'all'} onClick={() => setQueueScope('all')}><i className="is-all" aria-hidden="true" />全部</button>
            <button type="button" aria-pressed={queueScope === 'ranked'} onClick={() => setQueueScope('ranked')}><i className="is-ranked" aria-hidden="true" />排位</button>
          </div>
          <label><span className="personal-history__sr-only">胜负筛选</span><select aria-label="胜负筛选" value={resultScope} onChange={(event) => setResultScope(event.target.value as HistoryResultScope)}><option value="all">全部结果</option><option value="wins">仅胜利</option><option value="losses">仅失败</option></select></label>
        </div>
      </section>

      <HistoryWorkspace matches={filteredMatches} snapshot={snapshot} onPlayerSelect={onPlayerSelect} />
    </div>
  </main>;
}

import { useEffect, useMemo, useState } from 'react';
import type { MatchAchievement, MatchParticipantSummary, MatchSummary, PersonalHistorySnapshot } from '../../../../shared/domain';
import type { PersonalHistoryTarget } from '../../../../shared/ipc';
import { localizeRank } from '../../../../shared/rank';
import { isBuildItem } from '../../../../shared/items';
import { describeQueue, isRankedQueue } from '../../../../shared/queue';
import damageIcon from '../../assets/match-damage.png';
import damageTakenIcon from '../../assets/match-damage-taken.png';
import goldIcon from '../../assets/match-gold.png';
import './personal-history.css';

type HistoryState = 'loading' | 'ready' | 'unavailable';
type HistoryQueueScope = 'all' | 'ranked';
type HistoryResultScope = 'all' | 'wins' | 'losses';

const championIconUrl = (_version: string | undefined, championId: number) =>
  `lol-asset://champion-icons/${championId}.png`;

const profileIconUrl = (_version: string | undefined, profileIconId: number) =>
  `lol-asset://profile-icons/${profileIconId}.jpg`;

const itemIconUrl = (_version: string | undefined, iconPath: string) =>
  `lol-asset://game-data/${encodeURIComponent(iconPath)}`;
const spellIconNames: Record<number, string> = {
  1: 'summoner_boost.png',
  3: 'summoner_exhaust.png',
  4: 'summoner_flash.png',
  6: 'summoner_haste.png',
  7: 'summoner_heal.png',
  11: 'summoner_smite.png',
  12: 'summoner_teleport_new.png',
  13: 'summonermana.png',
  14: 'summonerignite.png',
  21: 'summonerbarrier.png',
  32: 'summoner_mark.png'
};

function spellIconUrl(_version: string | undefined, spellId: number): string | undefined {
  const filename = spellIconNames[spellId];
  return filename === undefined ? undefined : `lol-asset://spell-icons/${filename}`;
}
function SummonerSpells({ spellIds, assetVersion }: {
  spellIds?: [number, number];
  assetVersion?: string;
}) {
  return <div className="personal-history__spells">
    {(spellIds ?? []).map((spellId) => {
      const src = spellIconUrl(assetVersion, spellId);
      return src
        ? <img key={spellId} src={src} alt={`召唤师技能 ${spellId}`} loading="lazy" />
        : <span key={spellId} aria-label={`召唤师技能 ${spellId} 图标不可用`} role="img" />;
    })}
  </div>;
}

function TeamComposition({ match, assetVersion, viewerPlayerId, onPlayerSelect }: {
  match: MatchSummary;
  assetVersion?: string;
  viewerPlayerId: string;
  onPlayerSelect?: (target: PersonalHistoryTarget) => void;
}) {
  const teamRow = (
    side: 'ally' | 'enemy',
    championIds: number[] | undefined,
    players: MatchParticipantSummary[] | undefined
  ) =>
    Array.from({ length: 5 }, (_, index) => {
      const player = players?.[index];
      const championId = player?.championId ?? championIds?.[index];
      if (championId === undefined) {
        return <span key={`${side}-${index}`} className="personal-history__team-slot" aria-hidden="true" />;
      }
      const isLocal = player?.playerId === viewerPlayerId
        || (!players && side === 'ally' && championId === match.championId);
      const image = <img
          className={`personal-history__team-icon${isLocal ? ' is-local' : ''}`}
          src={championIconUrl(assetVersion, championId)}
          alt={`${side === 'ally' ? '己方' : '敌方'}英雄 ${championId}`}
          loading="lazy"
        />;
      if (!player?.playerId || isLocal || !onPlayerSelect) {
        return <span key={`${side}-${index}-${championId}`} className="personal-history__team-player">{image}</span>;
      }
      const label = player.displayName ?? `英雄 ${championId} 玩家`;
      return <button
        key={`${side}-${index}-${championId}`}
        type="button"
        className="personal-history__team-player personal-history__team-player--link"
        aria-label={`查看 ${label} 的个人战绩`}
        title={`查看 ${label} 的个人战绩`}
        onClick={() => onPlayerSelect({
          playerId: player.playerId!,
          ...(player.puuid ? { puuid: player.puuid } : {}),
          ...(player.displayName ? { displayName: player.displayName } : {}),
          ...(player.profileIconId === undefined ? {} : { profileIconId: player.profileIconId })
        })}
      >{image}</button>;
    });

  return <div className="personal-history__teams" data-testid="team-composition">
    <div className="is-ally" aria-label="己方阵容">{teamRow('ally', match.allyChampionIds, match.allyPlayers)}</div>
    <div className="is-enemy" aria-label="敌方阵容">{teamRow('enemy', match.enemyChampionIds, match.enemyPlayers)}</div>
  </div>;
}

const performanceAchievements: Array<{
  type: MatchAchievement['type'];
  label: string;
  icon: string;
}> = [
  { type: 'MOST_DAMAGE', label: '最高伤害', icon: damageIcon },
  { type: 'MOST_DAMAGE_TAKEN', label: '最高承伤', icon: damageTakenIcon },
  { type: 'MOST_GOLD', label: '最高经济', icon: goldIcon }
];

function PerformanceAchievements({ match }: { match: MatchSummary }) {
  const visible = performanceAchievements.filter(({ type }) =>
    match.achievements?.some((achievement) => achievement.type === type));
  if (visible.length === 0) return null;
  return <span className="personal-history__achievement-icons" aria-label="本场最高数据">
    {visible.map(({ type, label, icon }) => <span key={type} role="img" aria-label={label} title={label}>
      <img src={icon} alt="" aria-hidden="true" />
    </span>)}
  </span>;
}

function formatEndedAt(endedAt: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date(endedAt));
}

function MatchRow({ match, assetVersion, itemIconPaths, viewerPlayerId, onPlayerSelect }: {
  match: MatchSummary;
  assetVersion?: string;
  itemIconPaths?: Record<string, string>;
  viewerPlayerId: string;
  onPlayerSelect?: (target: PersonalHistoryTarget) => void;
}) {
  const kda = (match.kills + match.assists) / Math.max(1, match.deaths);
  return <article data-testid="personal-match" className={match.win ? 'is-win' : 'is-loss'}>
    <div className="personal-history__match-overview">
      <img className="personal-history__match-champion" src={championIconUrl(assetVersion, match.championId)} alt={`英雄 ${match.championId}`} loading="lazy" />
      <div className="personal-history__match-result">
        <strong>{match.win ? '胜利' : '失败'}</strong>
        <span>{describeQueue(match.queueId)}</span>
      </div>
      <div className="personal-history__match-performance">
        <span className="personal-history__match-kda" aria-label="KDA">
          <b>{match.kills}</b><i>/</i><b className="is-death">{match.deaths}</b><i>/</i><b>{match.assists}</b>
        </span>
        <span className="personal-history__match-performance-footer">
          <small>{kda.toFixed(2)} KDA</small>
          <PerformanceAchievements match={match} />
        </span>
      </div>
    </div>
    <div className="personal-history__loadout">
      <SummonerSpells spellIds={match.summonerSpellIds} assetVersion={assetVersion} />
      <div className="personal-history__items">
        {match.itemIds?.filter(isBuildItem).map((itemId, index) => {
          const iconPath = itemIconPaths?.[String(itemId)];
          return iconPath
            ? <img
                key={`${itemId}-${index}`}
                src={itemIconUrl(assetVersion, iconPath)}
                alt={`装备 ${itemId}`}
                loading="lazy"
              />
            : <span
                key={`${itemId}-${index}`}
                className="personal-history__item-placeholder"
                role="img"
                aria-label={`装备 ${itemId} 图标不可用`}
              />;
        })}
      </div>
    </div>
    <TeamComposition match={match} assetVersion={assetVersion} viewerPlayerId={viewerPlayerId} onPlayerSelect={onPlayerSelect} />
    <time dateTime={new Date(match.endedAt).toISOString()}>
      <b>{formatEndedAt(match.endedAt)}</b>
      <span>时长 {Math.round(match.durationSeconds / 60)} 分钟</span>
    </time>
  </article>;
}

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
    return <main className="personal-history"><div className="personal-history__unavailable">{onBack && <button type="button" onClick={onBack}>返回我的战绩</button>}<p role="status">正在加载个人战绩…</p></div></main>;
  }
  if (state === 'unavailable' || !snapshot) {
    return <main className="personal-history"><div className="personal-history__unavailable">{onBack && <button type="button" onClick={onBack}>返回我的战绩</button>}<p role="alert">{onBack ? '该玩家战绩暂时无法读取' : '请先启动英雄联盟客户端'}</p></div></main>;
  }

  return <main className="personal-history">
    <div className="personal-history__inner">
      <header className="personal-history__hero">
        <img className="personal-history__hero-avatar" src={profileIconUrl(snapshot.assetVersion, snapshot.profileIconId)} alt={`${snapshot.displayName}头像`} />
        <div className="personal-history__identity">
          {onBack && <button className="personal-history__back" type="button" onClick={onBack}>← 返回我的战绩</button>}
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

      <section className="personal-history__matches-panel" aria-labelledby="recent-matches">
          <div className="personal-history__panel-heading"><h2 id="recent-matches">最近战绩</h2><span>{filteredMatches.length} 场</span></div>
          <div className="personal-history__matches">
            {filteredMatches.map((match) => <MatchRow
              key={match.matchId}
              match={match}
              assetVersion={snapshot.assetVersion}
              itemIconPaths={snapshot.itemIconPaths}
              viewerPlayerId={snapshot.playerId}
              onPlayerSelect={onPlayerSelect}
            />)}
            {filteredMatches.length === 0 && <p className="personal-history__empty-filter" role="status">没有符合当前筛选的对局</p>}
          </div>
      </section>
    </div>
  </main>;
}

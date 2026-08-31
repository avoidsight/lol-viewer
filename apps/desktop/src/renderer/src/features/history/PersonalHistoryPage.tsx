import type { MatchSummary, PersonalHistorySnapshot } from '../../../../shared/domain';
import { localizeRank } from '../../../../shared/rank';
import { isBuildItem } from '../../../../shared/items';
import { describeQueue } from '../../../../shared/queue';
import damageIcon from '../../assets/match-damage.png';
import damageTakenIcon from '../../assets/match-damage-taken.png';
import goldIcon from '../../assets/match-gold.png';
import './personal-history.css';

type HistoryState = 'loading' | 'ready' | 'unavailable';

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

function TeamComposition({ match, assetVersion }: {
  match: MatchSummary;
  assetVersion?: string;
}) {
  const teamRow = (side: 'ally' | 'enemy', championIds: number[] | undefined) =>
    Array.from({ length: 5 }, (_, index) => {
      const championId = championIds?.[index];
      if (championId === undefined) {
        return <span key={`${side}-${index}`} className="personal-history__team-slot" aria-hidden="true" />;
      }
      const isLocal = side === 'ally' && championId === match.championId;
      return <img
        key={`${side}-${index}-${championId}`}
        className={`personal-history__team-icon${isLocal ? ' is-local' : ''}`}
        src={championIconUrl(assetVersion, championId)}
        alt={`${side === 'ally' ? '己方' : '敌方'}英雄 ${championId}`}
        loading="lazy"
      />;
    });

  return <div className="personal-history__teams" data-testid="team-composition">
    <div>{teamRow('ally', match.allyChampionIds)}</div>
    <div>{teamRow('enemy', match.enemyChampionIds)}</div>
  </div>;
}

function formatCompactValue(value: number): string {
  if (value < 1_000) return String(value);
  return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
}

function PerformanceMetrics({ match }: { match: MatchSummary }) {
  const metrics = [
    {
      label: '伤害',
      icon: damageIcon,
      value: match.totalDamageDealtToChampions,
      share: match.teamDamageShare
    },
    {
      label: '承伤',
      icon: damageTakenIcon,
      value: match.totalDamageTaken,
      share: match.teamDamageTakenShare
    },
    {
      label: '金币',
      icon: goldIcon,
      value: match.goldEarned,
      share: match.teamGoldShare
    }
  ];
  return <div className="personal-history__performance-metrics">
    {metrics.map(({ label, icon, value, share }) => {
      const compactValue = value === undefined ? '—' : formatCompactValue(value);
      const percentage = share === undefined ? '—' : `${Math.round(share * 100)}%`;
      return <div
        key={label}
        aria-label={`${label} ${compactValue}，占全队 ${percentage}`}
        title={`${label} ${compactValue}，占全队 ${percentage}`}
      >
        <img src={icon} alt="" aria-hidden="true" />
        <strong>
          <span className="personal-history__performance-value">{compactValue}</span>
          <span className="personal-history__performance-share">{percentage}</span>
        </strong>
      </div>;
    })}
  </div>;
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

function MatchRow({ match, assetVersion, itemIconPaths }: {
  match: MatchSummary;
  assetVersion?: string;
  itemIconPaths?: Record<string, string>;
}) {
  const kda = (match.kills + match.assists) / Math.max(1, match.deaths);
  return <article data-testid="personal-match" className={match.win ? 'is-win' : 'is-loss'}>
    <img className="personal-history__match-champion" src={championIconUrl(assetVersion, match.championId)} alt={`英雄 ${match.championId}`} loading="lazy" />
    <div className="personal-history__match-result">
      <strong>{match.win ? '胜利' : '失败'}</strong>
      <span>{describeQueue(match.queueId)}</span>
    </div>
    <div className="personal-history__match-performance">
      <span className="personal-history__match-kda" aria-label="KDA">
        <b>{match.kills}</b><i>/</i><b className="is-death">{match.deaths}</b><i>/</i><b>{match.assists}</b>
      </span>
      <small>{kda.toFixed(2)} KDA</small>
    </div>
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
    <PerformanceMetrics match={match} />
    <TeamComposition match={match} assetVersion={assetVersion} />
    <time dateTime={new Date(match.endedAt).toISOString()}>
      <b>{formatEndedAt(match.endedAt)}</b>
      <span>时长 {Math.round(match.durationSeconds / 60)} 分钟</span>
    </time>
  </article>;
}

export default function PersonalHistoryPage({ snapshot, state, onRefresh, refreshing = false, refreshError = '' }: {
  snapshot?: PersonalHistorySnapshot;
  state: HistoryState;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshError?: string;
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
          <p>{localizeRank(snapshot.rank) ?? '未定级'} · <strong>最近 {snapshot.sampleSize} 场</strong></p>
        </div>
        <dl className="personal-history__summary">
          <div className="personal-history__metric"><dt>胜场</dt><dd>{snapshot.wins}</dd></div>
          <div className="personal-history__metric"><dt>负场</dt><dd>{snapshot.losses}</dd></div>
          <div className="personal-history__metric personal-history__metric--primary"><dt>胜率</dt><dd>{(snapshot.winRate * 100).toFixed(1)}%</dd></div>
          <div className="personal-history__metric"><dt>平均 KDA</dt><dd>{snapshot.averageKda.toFixed(2)}</dd></div>
        </dl>
        <div className="personal-history__refresh">
          <button type="button" onClick={onRefresh} disabled={refreshing}>{refreshing ? '刷新中' : '刷新'}</button>
          {refreshError && <span aria-live="polite">{refreshError}</span>}
        </div>
      </header>

      <div className="personal-history__content">
        <section className="personal-history__panel personal-history__favorites-panel" aria-labelledby="favorite-champions">
          <div className="personal-history__panel-heading"><h2 id="favorite-champions">常用英雄</h2><span>最近 20 场</span></div>
          <div className="personal-history__favorites">
            {snapshot.favoriteChampions.map((champion) => <article data-testid="favorite-champion" key={champion.championId}>
              <img src={championIconUrl(snapshot.assetVersion, champion.championId)} alt={`英雄 ${champion.championId}`} loading="lazy" />
              <div className="personal-history__favorite-stats">
                <strong>{champion.games} 场</strong>
                <p>平均 {(champion.averageKills ?? 0).toFixed(1)} / {(champion.averageDeaths ?? 0).toFixed(1)} / {(champion.averageAssists ?? 0).toFixed(1)}</p>
              </div>
              <div className="personal-history__favorite-rate">
                <b>{(champion.winRate * 100).toFixed(1)}%</b>
                <span>胜率</span>
              </div>
            </article>)}
          </div>
        </section>

        <section className="personal-history__panel personal-history__matches-panel" aria-labelledby="recent-matches">
          <div className="personal-history__panel-heading"><h2 id="recent-matches">最近战绩</h2><span>装备、经济与全场最高徽章</span></div>
          <div className="personal-history__matches">
            {snapshot.matches.slice(0, 20).map((match) => <MatchRow
              key={match.matchId}
              match={match}
              assetVersion={snapshot.assetVersion}
              itemIconPaths={snapshot.itemIconPaths}
            />)}
          </div>
        </section>
      </div>
    </div>
  </main>;
}

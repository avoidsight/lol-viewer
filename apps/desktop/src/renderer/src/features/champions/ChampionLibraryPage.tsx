import { useEffect, useMemo, useState } from 'react';
import type { ChampionCatalogEntry, ChampionDetails, ChampionGuide, ChampionLane } from '../../../../shared/ipc';
import './champion-library.css';

const lanes: Array<{ value: ChampionLane; label: string }> = [
  { value: 'TOP', label: '上路' }, { value: 'JUNGLE', label: '打野' },
  { value: 'MIDDLE', label: '中路' }, { value: 'BOTTOM', label: '下路' },
  { value: 'UTILITY', label: '辅助' }
];
const roleNames: Record<string, string> = { fighter: '战士', tank: '坦克', mage: '法师', assassin: '刺客', marksman: '射手', support: '辅助' };
const sourceNames = { CN_OFFICIAL: '国服数据', OPGG: 'OP.GG', MANUAL: '内置推荐' } as const;
const championIcon = (id: number) => `lol-asset://champion-icons/${id}.png`;
const gameAsset = (path: string) => `lol-asset://game-data/${encodeURIComponent(path)}`;


interface Props {
  getCatalog: () => Promise<ChampionCatalogEntry[]>;
  getDetails: (id: number) => Promise<ChampionDetails>;
  getGuide: (id: number, lane: ChampionLane) => Promise<ChampionGuide>;
}

function defaultLane(champion: ChampionCatalogEntry): ChampionLane {
  if (champion.roles.includes('marksman')) return 'BOTTOM';
  if (champion.roles.includes('support')) return 'UTILITY';
  if (champion.roles.includes('assassin') || champion.roles.includes('mage')) return 'MIDDLE';
  return 'TOP';
}

function ItemSequence({ ids, iconPaths }: { ids: number[]; iconPaths?: Record<string, string> }) {
  return <div className="champion-library__item-sequence">{ids.map((id, index) => <span key={`${id}-${index}`}>
    {index > 0 && <i aria-hidden="true">›</i>}
    {iconPaths?.[String(id)] ? <img src={gameAsset(iconPaths[String(id)])} alt={`装备 ${id}`} loading="lazy" /> : <i className="champion-library__item-placeholder" aria-label={`装备 ${id} 图标加载中`} />}
  </span>)}</div>;
}

const activeSkillKeys = ['Q', 'W', 'E', 'R'] as const;

function SkillOrder({ keys, abilities }: { keys: string[]; abilities: Map<string, ChampionDetails['abilities'][number]> }) {
  const maxedAt = new Map(activeSkillKeys.map((key) => [key, keys.lastIndexOf(key)]));
  const priorityKeys = activeSkillKeys.filter((key) => key !== 'R').sort((left, right) => (maxedAt.get(left) ?? 99) - (maxedAt.get(right) ?? 99));
  return <div className="champion-library__skill-layout">
    <div className="champion-library__skill-overview" aria-label="Skill priority">
      {priorityKeys.map((key, index) => {
        const ability = abilities.get(key);
        return <div className={`champion-library__priority-skill champion-library__priority-skill--${key.toLowerCase()}`} key={key} title={`${ability?.name ?? key} · level ${(maxedAt.get(key) ?? -1) + 1} maxed`}>
          {index > 0 && <i aria-hidden="true">›</i>}
          {ability ? <img src={gameAsset(ability.iconPath)} alt={`${key} skill`} /> : <span className="champion-library__skill-placeholder" />}
          <b>{key}</b><small>{(maxedAt.get(key) ?? -1) + 1}</small>
        </div>;
      })}
    </div>
    <div className="champion-library__skill-sequence" aria-label="Level 1 to 18 skill order">
      {keys.map((key, index) => {
        const normalizedKey = key.toLowerCase();
        const isMaxed = maxedAt.get(key as typeof activeSkillKeys[number]) === index;
        return <div className={`champion-library__skill-step champion-library__skill-step--${normalizedKey}${isMaxed ? ' is-maxed' : ''}`} key={`${key}-${index}`} title={isMaxed ? `${key} maxed at level ${index + 1}` : `Level ${index + 1}: ${key}`}>
          <b>{key}</b>{isMaxed && <span className="champion-library__maxed-mark" aria-hidden="true" />}
        </div>;
      })}
    </div>
  </div>;
}export default function ChampionLibraryPage({ getCatalog, getDetails, getGuide }: Props) {
  const [catalog, setCatalog] = useState<ChampionCatalogEntry[]>([]);
  const [selectedId, setSelectedId] = useState<number>();
  const [details, setDetails] = useState<ChampionDetails>();
  const [guide, setGuide] = useState<ChampionGuide>();
  const [lane, setLane] = useState<ChampionLane>('BOTTOM');
  const [query, setQuery] = useState('');
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideFailed, setGuideFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void getCatalog().then((entries) => {
      if (!active) return;
      setCatalog(entries);
      if (entries[0]) { setSelectedId(entries[0].id); setLane(defaultLane(entries[0])); }
    }).catch(() => { if (active) setCatalogFailed(true); });
    return () => { active = false; };
  }, [getCatalog]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setDetailsLoading(true);
    void getDetails(selectedId).then((value) => { if (active) setDetails(value); })
      .catch(() => { if (active) setDetails(undefined); })
      .finally(() => { if (active) setDetailsLoading(false); });
    return () => { active = false; };
  }, [getDetails, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setGuideLoading(true); setGuideFailed(false);
    void getGuide(selectedId, lane).then((value) => { if (active) setGuide(value); })
      .catch(() => { if (active) { setGuide(undefined); setGuideFailed(true); } })
      .finally(() => { if (active) setGuideLoading(false); });
    return () => { active = false; };
  }, [getGuide, selectedId, lane]);

  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    if (!value) return catalog;
    return catalog.filter((champion) => `${champion.name} ${champion.title} ${champion.alias}`.toLocaleLowerCase().includes(value));
  }, [catalog, query]);
  const selected = catalog.find((champion) => champion.id === selectedId);
  const selectChampion = (champion: ChampionCatalogEntry) => {
    setSelectedId(champion.id); setLane(defaultLane(champion)); setGuide(undefined); setDetails(undefined);
  };
  const abilities = new Map(details?.abilities.map((ability) => [ability.key, ability]));

  if (catalogFailed) return <main className="champion-library"><div className="champion-library__empty" role="alert">英雄资料暂不可用，请先启动英雄联盟客户端</div></main>;
  return <main className="champion-library">
    <aside className="champion-library__sidebar" aria-label="英雄选择">
      <div className="champion-library__search">
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></svg>
        <input type="search" aria-label="搜索英雄" placeholder="搜索英雄名称" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <div className="champion-library__catalog-meta"><strong>全部英雄</strong><span>{filtered.length} 位</span></div>
      <div className="champion-library__champions">
        {filtered.map((champion) => <button type="button" key={champion.id} className={champion.id === selectedId ? 'is-active' : ''} onClick={() => selectChampion(champion)} aria-label={`${champion.title} ${champion.name}`}>
          <img src={championIcon(champion.id)} alt="" loading="lazy" />
          <span><b>{champion.title}</b><small>{champion.name}</small></span>
        </button>)}
        {catalog.length > 0 && filtered.length === 0 && <p className="champion-library__no-results">没有找到该英雄，试试中文称号或英文名</p>}
      </div>
    </aside>

    <div className="champion-library__main">
      {!selected && <div className="champion-library__empty" role="status">正在加载英雄目录…</div>}
      {selected && <>
        <header className="champion-library__hero">
          <img src={championIcon(selected.id)} alt={`${selected.title}头像`} />
          <div><p>{selected.name}</p><h1>{selected.title}</h1><div className="champion-library__roles">{selected.roles.map((role) => <span key={role}>{roleNames[role] ?? role}</span>)}</div></div>
          <div className="champion-library__source">{guide ? <><b>{sourceNames[guide.source]}</b><span>{guide.patch} · {guide.tier}</span>{guide.stale && <em>缓存数据</em>}</> : <span>{guideLoading ? '攻略加载中…' : '本地英雄资料'}</span>}</div>
        </header>
        <nav className="champion-library__lanes" aria-label="分路选择">{lanes.map((entry) => <button type="button" key={entry.value} className={lane === entry.value ? 'is-active' : ''} onClick={() => setLane(entry.value)}>{entry.label}</button>)}</nav>

        {detailsLoading && !details && <p role="status" className="champion-library__notice">正在加载技能资料…</p>}
        {details && <section className="champion-library__panel champion-library__abilities"><div className="champion-library__panel-title"><h2>英雄技能</h2><span>{details.shortBio}</span></div><div className="champion-library__ability-list">{details.abilities.map((ability) => <article key={ability.key} title={ability.description}>
          <div><img src={gameAsset(ability.iconPath)} alt={`${ability.name}图标`} /><b>{ability.key}</b></div><span><strong>{ability.name}</strong><small>{ability.description}</small></span>
        </article>)}</div></section>}

        {guideFailed && <p role="status" className="champion-library__notice champion-library__notice--warning">攻略数据暂不可用，技能资料仍可正常查看</p>}
        {guide && <div className="champion-library__guide-grid">
          <section className="champion-library__panel champion-library__skill-order"><div className="champion-library__panel-title"><h2>技能加点</h2><span>1—18 级推荐顺序</span></div>
            {guide.skillOrders?.length ? guide.skillOrders.map((order, orderIndex) => <div className="champion-library__skill-row" key={orderIndex}><SkillOrder keys={order.keys} abilities={abilities} />{order.pickRate !== undefined && <strong>{(order.pickRate * 100).toFixed(1)}%</strong>}</div>) : <p className="champion-library__muted">当前分路暂无技能顺序数据</p>}
          </section>
          <section className="champion-library__panel champion-library__builds"><div className="champion-library__panel-title"><h2>推荐出装</h2><span>按购买顺序排列</span></div>
            <div className="champion-library__build-basics">{guide.starterItemIds?.length ? <div><small>出门装</small><ItemSequence ids={guide.starterItemIds} iconPaths={guide.itemIconPaths} /></div> : null}{guide.bootsItemIds?.length ? <div><small>鞋子</small><ItemSequence ids={guide.bootsItemIds} iconPaths={guide.itemIconPaths} /></div> : null}</div>
            <div className="champion-library__core-builds">{guide.builds.map((build, index) => <div className="champion-library__build-row" key={index}><span>{index + 1}</span><ItemSequence ids={build.itemIds} iconPaths={guide.itemIconPaths} />{build.pickRate !== undefined && <strong>{(build.pickRate * 100).toFixed(1)}%</strong>}</div>)}</div>
          </section>
        </div>}
      </>}
    </div>
  </main>;
}
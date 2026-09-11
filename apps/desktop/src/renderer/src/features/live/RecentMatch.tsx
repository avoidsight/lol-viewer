import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MatchSummary } from '../../../../shared/domain';
import { describeQueue } from '../../../../shared/queue';
import { isBuildItem } from '../../../../shared/items';

const spells: Record<number, string> = { 1: 'summoner_boost.png', 3: 'summoner_exhaust.png', 4: 'summoner_flash.png', 6: 'summoner_haste.png', 7: 'summoner_heal.png', 11: 'summoner_smite.png', 12: 'summoner_teleport_new.png', 13: 'summonermana.png', 14: 'summonerignite.png', 21: 'summonerbarrier.png', 32: 'summoner_mark.png' };
const multiKills = { 2: '双杀', 3: '三杀', 4: '四杀', 5: '五杀' };
function OptionalIcon({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? null : <img src={src} alt={label} loading="lazy" onError={() => setFailed(true)} />;
}

export default function RecentMatch({ match, itemIconPaths = {}, compact = false }: { match: MatchSummary; compact?: boolean; assetVersion?: string; itemIconPaths?: Record<string, string> }) {
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const [preview, setPreview] = useState<{ left: number; top: number }>();
  useEffect(() => setPreview(undefined), [compact]);
  const showPreview = (element: HTMLElement) => {
    if (!compact) return;
    const rect = element.getBoundingClientRect();
    setPreview({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 328)), top: rect.bottom + 120 < window.innerHeight ? rect.bottom + 6 : rect.top - 114 });
  };
  const championLabel = `英雄 ${match.championId}`;
  const matchLabel = `${match.win ? '胜利' : '失败'} · ${describeQueue(match.queueId)} · KDA ${match.kills}/${match.deaths}/${match.assists}`;
  const date = new Date(match.endedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const spellIds = (match.summonerSpellIds ?? []).filter((id) => spells[id]);
  const itemIds = (match.itemIds ?? []).filter((id) => isBuildItem(id) && itemIconPaths[String(id)]).slice(0, 6);
  return (
    <li className={`recent-match ${match.win ? 'recent-match--win' : 'recent-match--loss'}${compact ? ' recent-match--compact' : ''}`} data-testid="recent-match" aria-label={matchLabel} tabIndex={compact ? 0 : undefined} onMouseEnter={event => showPreview(event.currentTarget)} onMouseLeave={() => setPreview(undefined)} onFocus={event => showPreview(event.currentTarget)} onBlur={() => setPreview(undefined)} onKeyDown={event => { if (event.key === 'Escape') setPreview(undefined); }} title={compact ? undefined : `${matchLabel} · ${date} · ${Math.round(match.durationSeconds / 60)}分钟`}>
      {imageUnavailable ? <span className="recent-match__fallback" role="img" aria-label={`${championLabel}图标不可用`}><b>{match.championId}</b></span> :
        <img className="recent-match__champion" src={`lol-asset://champion-icons/${match.championId}.png`} alt={championLabel} loading="lazy" onError={() => setImageUnavailable(true)} />}
      {spellIds.length > 0 && <span className="recent-match__spells">{spellIds.map((id, index) => <OptionalIcon key={index} src={`lol-asset://spell-icons/${spells[id]}`} label={`召唤师技能 ${id}`} />)}</span>}
      <span className="recent-match__performance">
        {(match.mvp || match.multiKill) && <span className="recent-match__badges">{match.mvp && <b>MVP</b>}{match.multiKill && <b className="is-multi">{multiKills[match.multiKill]}</b>}</span>}
        <span className="recent-match__kda" aria-hidden="true"><b>{match.kills}</b><i>/</i><b>{match.deaths}</b><i>/</i><b>{match.assists}</b></span>
        <small className="recent-match__mode">{describeQueue(match.queueId)}</small>
      </span>
      {itemIds.length > 0 && <span className="recent-match__items">{itemIds.map((id, index) => <OptionalIcon key={index} src={`lol-asset://game-data/${encodeURIComponent(itemIconPaths[String(id)])}`} label={`装备 ${id}`} />)}</span>}
      {compact && preview && createPortal(<div className="recent-match-preview" role="tooltip" style={preview}>
        <div>{match.win ? '胜利' : '失败'} · {describeQueue(match.queueId)}</div>
        <small>{date} · {Math.round(match.durationSeconds / 60)}分钟</small>
        <ol><RecentMatch match={match} itemIconPaths={itemIconPaths} /></ol>
      </div>, document.body)}
    </li>
  );
}

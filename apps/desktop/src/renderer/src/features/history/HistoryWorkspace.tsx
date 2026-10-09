import { useEffect, useState } from 'react';
import type { MatchParticipantSummary, MatchSummary, PersonalHistorySnapshot } from '../../../../shared/domain';
import type { PersonalHistoryTarget } from '../../../../shared/ipc';
import { describeQueue } from '../../../../shared/queue';
import './history-workspace.css';

const icon = (id: number) => `lol-asset://champion-icons/${id}.png`;
const number = (value?: number) => value === undefined ? '—' : value.toLocaleString('zh-CN');
const date = (value: number) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
function total(players: MatchParticipantSummary[], field: 'kills' | 'deaths' | 'assists' | 'goldEarned') {
  return players.length === 5 && players.every(p => p[field] !== undefined)
    ? players.reduce((sum, p) => sum + p[field]!, 0) : undefined;
}

function TeamDetails({ players, label, win, remake, snapshot, onPlayerSelect }: {
  players: MatchParticipantSummary[]; label: string; win: boolean; remake?: boolean; snapshot: PersonalHistorySnapshot;
  onPlayerSelect?: (target: PersonalHistoryTarget) => void;
}) {
  return <section className={`history-team ${win ? 'is-win' : 'is-loss'}`} aria-label={`${label}详情`}>
    <header><h3>{label}<span>{remake ? '重开' : win ? '胜利' : '失败'}</span></h3><div><span title="全队击杀 / 死亡 / 助攻">总 KDA <b>{number(total(players, 'kills'))} / {number(total(players, 'deaths'))} / {number(total(players, 'assists'))}</b></span><span>总经济 <b>{number(total(players, 'goldEarned'))}</b></span></div></header>
    <div className="history-team__table-wrap"><table><thead><tr><th>召唤师</th><th>K / D / A</th><th>装备</th><th>经济</th><th>伤害</th><th>承伤</th><th>补刀</th></tr></thead><tbody>
      {players.map((p, index) => <tr key={`${p.playerId ?? p.championId}-${index}`} className={p.playerId === snapshot.playerId ? 'is-viewed' : undefined}>
        <td><div className="history-team__player"><img src={icon(p.championId)} alt={`英雄 ${p.championId}`} />
          {p.playerId && p.playerId !== '0' && p.playerId !== snapshot.playerId && onPlayerSelect
            ? <button title={p.displayName} onClick={() => onPlayerSelect({ playerId: p.playerId!, puuid: p.puuid, displayName: p.displayName, profileIconId: p.profileIconId })}>{p.displayName ?? '查看玩家'}</button>
            : <span title={p.displayName}>{p.displayName ?? '未知玩家'}{p.playerId === snapshot.playerId && <small>当前查看</small>}</span>}
        </div></td>
        <td className="history-team__kda">{number(p.kills)} <i>/</i> <em>{number(p.deaths)}</em> <i>/</i> {number(p.assists)}</td>
        <td><div className="history-team__items" aria-label="装备">
          {Array.from({ length: 6 }, (_, slot) => {
            const id = p.itemIds?.[slot]; const path = id ? snapshot.itemIconPaths?.[String(id)] : undefined;
            return path ? <img key={slot} src={`lol-asset://game-data/${encodeURIComponent(path)}`} alt={`装备 ${id}`} title={`装备 ${id}`} />
              : <span key={slot} title={id ? `装备 ${id}（图标不可用）` : p.itemIds ? '空装备栏' : '装备数据缺失'}>{id ? '?' : ''}</span>;
          })}
        </div></td><td>{number(p.goldEarned)}</td><td>{number(p.damage)}</td><td>{number(p.damageTaken)}</td><td>{number(p.cs)}</td>
      </tr>)}
    </tbody></table></div>
    {players.length < 5 && <p className="history-team__missing">部分玩家详情暂不可用</p>}
  </section>;
}

export default function HistoryWorkspace({ matches, snapshot, onPlayerSelect }: {
  matches: MatchSummary[]; snapshot: PersonalHistorySnapshot; onPlayerSelect?: (target: PersonalHistoryTarget) => void;
}) {
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  useEffect(() => { setPage(0); setSelectedId(undefined); }, [matches, snapshot.playerId]);
  const pageCount = Math.max(1, Math.ceil(matches.length / 10));
  const visible = matches.slice(Math.min(page, pageCount - 1) * 10, (Math.min(page, pageCount - 1) + 1) * 10);
  const selected = visible.find(m => m.matchId === selectedId) ?? visible[0];
  const allies = selected?.allyPlayers ?? selected?.allyChampionIds?.map(championId => ({ championId })) ?? [];
  const enemies = selected?.enemyPlayers ?? selected?.enemyChampionIds?.map(championId => ({ championId })) ?? [];
  return <div className="history-workspace">
    <section className="history-browser" aria-label="战绩列表">
      <header><h2>最近战绩</h2><span>{matches.length} 场</span></header>
      <div className="history-browser__list">
        {visible.map(match => <button key={match.matchId} data-testid="personal-match" className={`history-list-row ${match.win ? 'is-win' : 'is-loss'}`} aria-pressed={selected?.matchId === match.matchId} onClick={() => setSelectedId(match.matchId)}>
          <img src={icon(match.championId)} alt={`英雄 ${match.championId}`} /><span><strong>{match.remake ? '重开' : match.win ? '胜利' : '失败'}</strong><small>{describeQueue(match.queueId)}</small></span>
          <span className="history-list-row__right"><b>{match.kills} / <em>{match.deaths}</em> / {match.assists}</b><small>{date(match.endedAt)}</small></span>
        </button>)}
        {!matches.length && <p className="personal-history__empty-filter" role="status">没有符合当前筛选的对局</p>}
      </div>
      <nav className="history-pagination" aria-label="战绩分页"><button disabled={page === 0} onClick={() => { setPage(p => p - 1); setSelectedId(undefined); }}>上一页</button><span>{page + 1} / {pageCount}</span><button disabled={page + 1 >= pageCount} onClick={() => { setPage(p => p + 1); setSelectedId(undefined); }}>下一页</button></nav>
    </section>
    <section className="history-detail" aria-label="选中对局详情">
      {selected ? <>
        <TeamDetails players={allies} label="己方" win={selected.win} remake={selected.remake} snapshot={snapshot} onPlayerSelect={onPlayerSelect} />
        <TeamDetails players={enemies} label="敌方" win={!selected.win} remake={selected.remake} snapshot={snapshot} onPlayerSelect={onPlayerSelect} />
        <footer>对局 ID · {selected.matchId}</footer>
      </> : <div className="history-detail__empty">暂无对局详情</div>}
    </section>
  </div>;
}

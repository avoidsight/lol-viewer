import { useEffect, useState } from 'react';
import type { ChampionGuide, ChampionLane } from '../../../../shared/ipc';
import './champion-library.css';

const sourceNames = { CN_OFFICIAL: '国服官方', OPGG: 'OPGG', MANUAL: '人工维护' } as const;
export default function ChampionLibraryPage({ getGuide, onBack }: { getGuide: (id: number, lane: ChampionLane) => Promise<ChampionGuide>; onBack?: () => void }) {
  const [guide, setGuide] = useState<ChampionGuide>(); const [failed, setFailed] = useState(false);
  useEffect(() => { let active = true; void getGuide(114, 'TOP').then(x => { if (active) setGuide(x); }).catch(() => { if (active) setFailed(true); }); return () => { active = false; }; }, [getGuide]);
  if (failed) return <main className="champion-library"><button onClick={onBack}>返回实时对局</button><p role="alert">英雄数据暂不可用</p></main>;
  if (!guide) return <main className="champion-library"><button onClick={onBack}>返回实时对局</button><p role="status">正在加载英雄资料…</p></main>;
  const matchup = (title: string, entries: ChampionGuide['favorable']) => <section><h2>{title}</h2><ul>{entries.map(x => <li key={x.opponentChampionId}>英雄 {x.opponentChampionId} · {(x.winRate * 100).toFixed(1)}%{x.games === undefined ? '' : ` · ${x.games} 场`}</li>)}</ul></section>;
  return <main className="champion-library"><header><button onClick={onBack}>返回实时对局</button><h1>英雄资料库</h1></header>{guide.stale && <strong className="stale">离线缓存</strong>}<p><strong>{sourceNames[guide.source]}</strong> · {guide.region} · {guide.tier} · {guide.patch}</p><p>抓取时间：{new Date(guide.fetchedAt).toLocaleString('zh-CN')}</p><section><h2>推荐出装</h2><ul>{guide.builds.map((x, i) => <li key={i}>{x.itemIds.join(' → ')}{x.pickRate === undefined ? '' : ` · ${(x.pickRate * 100).toFixed(1)}%`}</li>)}</ul></section>{matchup('优势对位', guide.favorable)}{matchup('劣势对位', guide.unfavorable)}<section><h2>管理员说明</h2><ul>{guide.notes.map(x => <li key={x}>{x}</li>)}</ul></section></main>;
}

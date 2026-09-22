import { useRef, useState } from 'react';
import type { PersonalHistoryTarget } from '../../../../shared/ipc';
import { playerSearchInputSchema } from '../../../../shared/player-search';
import './player-search.css';

const errors = { unavailable: '请先登录英雄联盟客户端', 'not-found': '当前大区未找到该玩家，请检查名字和编号', failed: '查询失败，请稍后重试', busy: '正在查询，请稍候' };
export default function PlayerSearch({ onSelect, onBack }: { onSelect: (target: PersonalHistoryTarget) => Promise<void>; onBack?: () => void }) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  return <form className="player-search" aria-label="搜索玩家" onSubmit={async event => {
    event.preventDefault();
    if (lock.current) return;
    const input = playerSearchInputSchema.safeParse(query);
    if (!input.success) { setError('请输入完整的名字#编号'); return; }
    const requestId = ++generation.current;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await window.lolViewer?.searchPlayer?.(input.data);
      if (requestId !== generation.current) return;
      if (!result) setError(errors.unavailable);
      else if (!result.ok) setError(errors[result.error]);
      else await onSelect(result.target);
    } catch { if (requestId === generation.current) setError(errors.failed); }
    finally { if (requestId === generation.current) { lock.current = false; setBusy(false); } }
  }}>
    {onBack && <button className="player-search__back" type="button" aria-label="返回我的战绩" onClick={() => {
      generation.current++; lock.current = false; setBusy(false); setError(''); setQuery(''); onBack();
    }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m10 6-6 6 6 6M4 12h16" /></svg>
      <span>我的战绩</span>
    </button>}
    <span className="player-search__scope">当前大区</span>
    <input aria-label="玩家名字和编号" aria-invalid={!!error} aria-describedby={error ? 'player-search-error' : undefined}
      placeholder="搜索玩家：名字#编号" maxLength={100} value={query} disabled={busy}
      onChange={event => { setQuery(event.target.value); setError(''); }} />
    <button type="submit" disabled={busy}>{busy ? '查询中…' : '搜索'}</button>
    {error && <span id="player-search-error" role="alert">{error}</span>}
  </form>;
}

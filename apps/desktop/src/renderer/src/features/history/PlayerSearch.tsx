import { useRef, useState } from 'react';
import type { PersonalHistoryTarget } from '../../../../shared/ipc';
import { playerSearchInputSchema } from '../../../../shared/player-search';
import './player-search.css';

const errors = { unavailable: '请先登录英雄联盟客户端', 'not-found': '当前大区未找到该玩家，请检查名字和编号', failed: '查询失败，请稍后重试', busy: '正在查询，请稍候' };
export default function PlayerSearch({ onSelect }: { onSelect: (target: PersonalHistoryTarget) => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  return <form className="player-search" aria-label="搜索玩家" onSubmit={async event => {
    event.preventDefault();
    if (lock.current) return;
    const input = playerSearchInputSchema.safeParse(query);
    if (!input.success) { setError('请输入完整的名字#编号'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await window.lolViewer?.searchPlayer?.(input.data);
      if (!result) setError(errors.unavailable);
      else if (!result.ok) setError(errors[result.error]);
      else await onSelect(result.target);
    } catch { setError(errors.failed); }
    finally { lock.current = false; setBusy(false); }
  }}>
    <span className="player-search__scope">当前大区</span>
    <input aria-label="玩家名字和编号" aria-invalid={!!error} aria-describedby={error ? 'player-search-error' : undefined}
      placeholder="搜索玩家：名字#编号" maxLength={100} value={query} disabled={busy}
      onChange={event => { setQuery(event.target.value); setError(''); }} />
    <button type="submit" disabled={busy}>{busy ? '查询中…' : '搜索'}</button>
    {error && <span id="player-search-error" role="alert">{error}</span>}
  </form>;
}

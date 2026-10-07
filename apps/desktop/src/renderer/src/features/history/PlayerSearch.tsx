import { useEffect, useRef, useState } from 'react';
import type { PersonalHistoryTarget } from '../../../../shared/ipc';
import { clipboardPlayerId, playerSearchInputSchema } from '../../../../shared/player-search';
import './player-search.css';

const errors = { unavailable: '请先登录英雄联盟客户端', 'not-found': '当前大区未找到该玩家，请检查名字和编号', failed: '查询失败，请稍后重试', busy: '正在查询，请稍候' };
export default function PlayerSearch({ onSelect }: { onSelect: (target: PersonalHistoryTarget) => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const edits = useRef(0);
  useEffect(() => () => { generation.current++; edits.current++; }, []);
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
    <div className={`player-search__field${error ? ' is-invalid' : ''}`} aria-busy={busy}>
    <input aria-label="玩家名字和编号" aria-invalid={!!error} aria-describedby={error ? 'player-search-error' : undefined}
      placeholder="搜索本区召唤师：名字#编号" maxLength={100} value={query} disabled={busy}
      onFocus={async event => {
        if (query || lock.current) return;
        const input = event.currentTarget;
        const edit = ++edits.current;
        try {
          const value = await window.lolViewer?.readClipboardPlayerId?.();
          if (edit === edits.current && document.activeElement === input && !lock.current && value && clipboardPlayerId(value)) {
            setQuery(value); setError('');
          }
        } catch { /* Clipboard access is optional; manual search remains available. */ }
      }}
      onChange={event => { edits.current++; setQuery(event.target.value); setError(''); }} />
    <button className="player-search__submit" type="submit" disabled={busy} aria-label={busy ? '查询中' : '搜索'} title={busy ? '查询中' : '搜索'}>
      {busy ? <svg className="player-search__spinner" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-8-8" /></svg> :
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>}
    </button>
    </div>
    {error && <span id="player-search-error" role="alert">{error}</span>}
  </form>;
}

import { useEffect, useState } from 'react';
import type { PlayerSnapshot, QueueScope } from '../../shared/domain';
import type { LiveMatch, LolViewerApi } from '../../shared/ipc';
import LiveMatchPage from './features/live/LiveMatchPage';
import ChampionLibraryPage from './features/champions/ChampionLibraryPage';

declare global { interface Window { lolViewer?: LolViewerApi } }

const scopeName = (scope: QueueScope): string => scope === 'ranked-solo' ? '单双排' : '全部模式';

export default function App() {
  const [requestedScope, setRequestedScope] = useState<QueueScope>('ranked-solo');
  const [displayedScope, setDisplayedScope] = useState<QueueScope>('ranked-solo');
  const [match, setMatch] = useState<LiveMatch | null>(null);
  const [progress, setProgress] = useState<PlayerSnapshot[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [page, setPage] = useState<'live' | 'champions'>('live');

  useEffect(() => {
    let active = true;
    const api = window.lolViewer;
    if (!api) { setState('error'); return; }
    setState('loading');
    setProgress([]);
    const unsubscribe = api.onPlayerUpdated((player) => {
      if (!active || player.scope !== requestedScope) return;
      setProgress((current) => [...current.filter((entry) => entry.playerId !== player.playerId), player]);
    });
    void api.getLiveMatch(requestedScope).then((nextMatch) => {
      if (!active) return;
      setMatch(nextMatch);
      setDisplayedScope(requestedScope);
      setProgress([]);
      setState('ready');
    }).catch(() => { if (active) setState('error'); });
    return () => { active = false; unsubscribe(); };
  }, [requestedScope]);

  const notice = state === 'loading' ? <p className="live-match-page__notice" role="status">正在加载{scopeName(requestedScope)}对局…</p> : state === 'error' ? <p className="live-match-page__notice live-match-page__notice--error" role="alert">{window.lolViewer ? `${scopeName(requestedScope)}对局加载失败，请重试` : '未连接英雄联盟客户端'}</p> : null;
  return <><div style={{ display: page === 'live' ? 'block' : 'none' }} aria-hidden={page !== 'live'}><button type="button" onClick={() => setPage('champions')} style={{ position: 'fixed', zIndex: 2, top: 20, left: 150 }}>英雄资料库</button><LiveMatchPage match={match ?? undefined} players={match ? undefined : progress} scope={displayedScope} onScopeChange={setRequestedScope} notice={notice} /></div>{page === 'champions' && <ChampionLibraryPage getGuide={(id, lane) => window.lolViewer?.getChampionGuide(id, lane) ?? Promise.reject(new Error('unavailable'))} onBack={() => setPage('live')} />}</>;
}

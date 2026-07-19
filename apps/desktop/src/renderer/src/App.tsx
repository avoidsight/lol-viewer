import { useCallback, useEffect, useRef, useState } from 'react';
import type { PersonalHistorySnapshot, PlayerSnapshot, QueueScope } from '../../shared/domain';
import type { AppSettings, LiveMatch, LolViewerApi } from '../../shared/ipc';
import LiveMatchPage from './features/live/LiveMatchPage';
import ChampionLibraryPage from './features/champions/ChampionLibraryPage';
import AppShell, { type AppTab } from './AppShell';
import PersonalHistoryPage from './features/history/PersonalHistoryPage';

declare global { interface Window { lolViewer?: LolViewerApi } }

const defaults: AppSettings = { queueScope: 'ranked-solo', autoOpenLiveMatch: true, showLaneDifferences: true };
const scopeName = (scope: QueueScope): string => scope === 'ranked-solo' ? '单双排' : '全部模式';

export default function App({ initialTab = 'history' }: { initialTab?: AppTab } = {}) {
  const [requestedScope, setRequestedScope] = useState<QueueScope>('ranked-solo');
  const [displayedScope, setDisplayedScope] = useState<QueueScope>('ranked-solo');
  const [match, setMatch] = useState<LiveMatch | null>(null);
  const [progress, setProgress] = useState<PlayerSnapshot[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [page, setPage] = useState<AppTab>(initialTab);
  const [history, setHistory] = useState<PersonalHistorySnapshot>();
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [message, setMessage] = useState('');
  const [loadNonce, setLoadNonce] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const api = window.lolViewer;
    if (!api) { setHistoryState('unavailable'); return; }
    void Promise.resolve(api.getPersonalHistory()).then((snapshot) => {
      if (!snapshot) { setHistoryState('unavailable'); return; }
      setHistory(snapshot); setHistoryState('ready');
    }).catch(() => setHistoryState('unavailable'));
  }, []);

  useEffect(() => {
    const api = window.lolViewer;
    if (!api) { setState('error'); return; }
    void Promise.resolve(api.getSettings()).then((value) => {
      const next = value ?? defaults;
      setSettings(next); setRequestedScope(next.queueScope); setDisplayedScope(next.queueScope);
      if (!next.autoOpenLiveMatch) setState('ready');
    }).catch(() => setSettings(defaults));
  }, []);

  useEffect(() => {
    if (!settings || (!settings.autoOpenLiveMatch && loadNonce === 0)) return;
    let active = true;
    const api = window.lolViewer;
    if (!api) { setState('error'); return; }
    const currentGeneration = ++generation.current;
    setState('loading'); setProgress([]);
    const unsubscribe = api.onPlayerUpdated((player, eventGeneration = currentGeneration) => {
      if (!active || eventGeneration !== currentGeneration || player.scope !== requestedScope) return;
      setProgress((current) => [...current.filter((entry) => entry.playerId !== player.playerId), player]);
      setMatch(null);
      setDisplayedScope(requestedScope);
    });
    void api.getLiveMatch(requestedScope, currentGeneration).then((next) => {
      if (!active) return;
      setMatch(next); setDisplayedScope(requestedScope); setProgress([]); setState('ready');
    }).catch(() => { if (active) setState('error'); });
    return () => { active = false; unsubscribe(); };
  }, [requestedScope, settings?.autoOpenLiveMatch, loadNonce]);

  const update = async (patch: Partial<AppSettings>) => {
    if (!window.lolViewer) return;
    setMessage('Saving settings…');
    try { const next = await window.lolViewer.updateSettings(patch); if (patch.autoOpenLiveMatch === false) await window.lolViewer.cancelLiveMatch?.(); setSettings(next); setRequestedScope(next.queueScope); setMessage('Settings saved'); }
    catch { setMessage('Settings could not be saved'); }
  };
  const retry = () => { void window.lolViewer?.retryLiveMatch?.(); setLoadNonce((value) => value + 1); };
  const clearCache = async () => { setMessage('Clearing cache…'); try { await window.lolViewer?.clearCache(); setMessage('Cache cleared'); } catch { setMessage('Cache could not be cleared'); } };
  const getChampionGuide = useCallback((id: Parameters<LolViewerApi['getChampionGuide']>[0], lane: Parameters<LolViewerApi['getChampionGuide']>[1]) =>
    window.lolViewer?.getChampionGuide(id, lane) ?? Promise.reject(new Error('unavailable')), []);
  const notice = state === 'loading' ? <p role="status">正在加载{scopeName(requestedScope)}对局</p> : state === 'error' ? <p role="alert">{scopeName(requestedScope)}对局加载失败，请在客户端和十人对局就绪后重试</p> : null;

  const livePage = <div>
    <aside aria-label="Settings"><label>Auto-open live match <input type="checkbox" checked={settings?.autoOpenLiveMatch ?? true} onChange={(event) => void update({ autoOpenLiveMatch: event.target.checked })} /></label><label>Show lane differences <input type="checkbox" checked={settings?.showLaneDifferences ?? true} onChange={(event) => void update({ showLaneDifferences: event.target.checked })} /></label><button type="button" onClick={retry}>Retry live match</button><button type="button" onClick={() => void clearCache()}>Clear cache</button>{message && <span aria-live="polite">{message}</span>}</aside>
    <LiveMatchPage match={match ?? undefined} players={match ? undefined : progress} scope={displayedScope} onScopeChange={(scope) => void update({ queueScope: scope })} showLaneDifferences={settings?.showLaneDifferences ?? true} notice={notice} />
  </div>;
  const content = page === 'history'
    ? <PersonalHistoryPage snapshot={history} state={historyState} />
    : page === 'live'
      ? livePage
      : <ChampionLibraryPage getGuide={getChampionGuide} />;
  return <AppShell active={page} onChange={setPage}>{content}</AppShell>;
}

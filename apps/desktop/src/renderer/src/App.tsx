import { useCallback, useEffect, useRef, useState } from 'react';
import type { PersonalHistorySnapshot, PlayerSnapshot } from '../../shared/domain';
import type { AppSettings, LiveMatch, LolViewerApi } from '../../shared/ipc';
import AppShell, { type AppTab } from './AppShell';
import ChampionLibraryPage from './features/champions/ChampionLibraryPage';
import PersonalHistoryPage from './features/history/PersonalHistoryPage';
import LiveMatchPage from './features/live/LiveMatchPage';

declare global { interface Window { lolViewer?: LolViewerApi } }

const defaults: AppSettings = { queueScope: 'ranked-solo', autoOpenLiveMatch: true, showLaneDifferences: true };

export default function App({ initialTab = 'history' }: { initialTab?: AppTab } = {}) {
  const [page, setPage] = useState<AppTab>(initialTab);
  const [history, setHistory] = useState<PersonalHistorySnapshot>();
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [match, setMatch] = useState<LiveMatch>();
  const [progress, setProgress] = useState<PlayerSnapshot[]>([]);
  const [liveState, setLiveState] = useState<'waiting' | 'ready' | 'error'>('waiting');
  const [settings, setSettings] = useState<AppSettings>(defaults);
  const [message, setMessage] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const generation = useRef(0);
  const historyRequest = useRef<Promise<PersonalHistorySnapshot> | undefined>(undefined);

  useEffect(() => {
    if (page !== 'history' || history) return;
    let active = true;
    const api = window.lolViewer;
    if (!api) { setHistoryState('unavailable'); return; }
    const request = historyRequest.current ?? Promise.resolve(api.getPersonalHistory());
    historyRequest.current = request;
    void request.then((snapshot) => {
      if (!active) return;
      if (!snapshot) { setHistoryState('unavailable'); return; }
      setHistory(snapshot); setHistoryState('ready');
    }).catch(() => { if (active) setHistoryState('unavailable'); }).finally(() => {
      if (historyRequest.current === request) historyRequest.current = undefined;
    });
    return () => { active = false; };
  }, [page, history]);

  useEffect(() => {
    const api = window.lolViewer;
    if (!api) return;
    void Promise.resolve(api.getSettings()).then((value) => { if (value) setSettings(value); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (page !== 'live') return;
    let active = true;
    const api = window.lolViewer;
    if (!api) { setLiveState('error'); return; }
    const currentGeneration = ++generation.current;
    setMatch(undefined); setProgress([]); setLiveState('waiting');
    const unsubscribe = api.onPlayerUpdated((player, eventGeneration = currentGeneration) => {
      if (!active || eventGeneration !== currentGeneration || player.scope !== 'all') return;
      setProgress((current) => [...current.filter((entry) => entry.playerId !== player.playerId), player]);
      setMatch(undefined); setLiveState('ready');
    });
    void api.getLiveMatch('all', currentGeneration).then((next) => {
      if (!active || currentGeneration !== generation.current) return;
      setMatch(next); setProgress([]); setLiveState('ready');
    }).catch(() => { if (active && currentGeneration === generation.current) setLiveState('error'); });
    return () => {
      active = false;
      unsubscribe();
      void Promise.resolve(api.cancelLiveMatch?.()).catch(() => undefined);
    };
  }, [page, retryNonce]);

  const retry = () => { setRetryNonce((value) => value + 1); };
  const clearCache = async () => { setMessage('Clearing cache…'); try { await window.lolViewer?.clearCache(); setMessage('Cache cleared'); } catch { setMessage('Cache could not be cleared'); } };
  const updateLaneSetting = async (showLaneDifferences: boolean) => {
    try { const next = await window.lolViewer?.updateSettings({ showLaneDifferences }); if (next) setSettings(next); } catch { setMessage('Settings could not be saved'); }
  };
  const getChampionGuide = useCallback((id: Parameters<LolViewerApi['getChampionGuide']>[0], lane: Parameters<LolViewerApi['getChampionGuide']>[1]) =>
    window.lolViewer?.getChampionGuide(id, lane) ?? Promise.reject(new Error('unavailable')), []);
  const liveNotice = liveState === 'waiting'
    ? <p role="status" className="live-match-page__notice">等待进入英雄选择或游戏</p>
    : liveState === 'error'
      ? <p role="alert" className="live-match-page__notice live-match-page__notice--error">对战信息暂时无法读取，请重试</p>
      : null;

  const content = page === 'history'
    ? <PersonalHistoryPage snapshot={history} state={historyState} />
    : page === 'live'
      ? <div><aside aria-label="Settings"><label>Show lane differences <input type="checkbox" checked={settings.showLaneDifferences} onChange={(event) => void updateLaneSetting(event.target.checked)} /></label><button type="button" onClick={retry}>Retry live match</button><button type="button" onClick={() => void clearCache()}>Clear cache</button>{message && <span aria-live="polite">{message}</span>}</aside><LiveMatchPage match={match} players={match ? undefined : progress} showLaneDifferences={settings.showLaneDifferences} notice={liveNotice} /></div>
      : <ChampionLibraryPage getGuide={getChampionGuide} />;
  return <AppShell active={page} onChange={setPage}>{content}</AppShell>;
}

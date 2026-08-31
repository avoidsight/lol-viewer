import { useCallback, useEffect, useRef, useState } from 'react';
import type { PersonalHistorySnapshot, PlayerSnapshot } from '../../shared/domain';
import type { AppSettings, LiveMatch, LolViewerApi } from '../../shared/ipc';
import AppShell, { type AppTab } from './AppShell';
import ChampionLibraryPage from './features/champions/ChampionLibraryPage';
import PersonalHistoryPage from './features/history/PersonalHistoryPage';
import LiveMatchPage from './features/live/LiveMatchPage';
import SettingsPage from './features/settings/SettingsPage';

declare global { interface Window { lolViewer?: LolViewerApi } }

const defaults: AppSettings = { queueScope: 'ranked-solo', autoOpenLiveMatch: true, showLaneDifferences: true, autoAcceptReadyCheck: false };
const activePhases = new Set(['ChampSelect', 'GameStart', 'InProgress', 'Reconnect']);
const clientRetryDelayMs = 3_000;

export default function App({ initialTab = 'history' }: { initialTab?: AppTab } = {}) {
  const [page, setPage] = useState<AppTab>(initialTab);
  const [history, setHistory] = useState<PersonalHistorySnapshot>();
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyRefreshError, setHistoryRefreshError] = useState('');
  const [match, setMatch] = useState<LiveMatch>();
  const [progress, setProgress] = useState<PlayerSnapshot[]>([]);
  const [liveState, setLiveState] = useState<'waiting' | 'ready' | 'error'>('waiting');
  const [liveRequesting, setLiveRequesting] = useState(false);
  const [liveAttention, setLiveAttention] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(defaults);
  const [message, setMessage] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const generation = useRef(0);
  const pageRef = useRef(page);
  const historyRequest = useRef<Promise<PersonalHistorySnapshot> | undefined>(undefined);
  const historyRefreshingRef = useRef(false);
  const liveSnapshotRef = useRef(false);
  const currentGameIdRef = useRef<string | undefined>(undefined);
  const liveRequestingRef = useRef(false);

  useEffect(() => {
    if (page !== 'history') return;
    let active = true;
    const api = window.lolViewer;
    if (!api) { setHistoryState('unavailable'); return; }
    const request = historyRequest.current ?? Promise.resolve(api.getPersonalHistory());
    historyRequest.current = request;
    void request.then((snapshot) => {
      if (!active) return;
      if (!snapshot) { if (!history) setHistoryState('unavailable'); return; }
      setHistory(snapshot); setHistoryState('ready');
    }).catch(() => { if (active && !history) setHistoryState('unavailable'); }).finally(() => {
      if (historyRequest.current === request) historyRequest.current = undefined;
    });
    return () => { active = false; };
  }, [page]);

  useEffect(() => { pageRef.current = page; }, [page]);

  useEffect(() => {
    if (page !== 'history' || historyState !== 'unavailable' || !window.lolViewer) return;
    let active = true;
    let timer: number | undefined;
    const poll = async (): Promise<void> => {
      if (!active || !window.lolViewer) return;
      try {
        const snapshot = await window.lolViewer.getPersonalHistory();
        if (!active) return;
        if (snapshot) { setHistory(snapshot); setHistoryState('ready'); return; }
      } catch {
        // The League client is still starting; retry shortly.
      }
      if (active) timer = window.setTimeout(() => void poll(), clientRetryDelayMs);
    };
    timer = window.setTimeout(() => void poll(), clientRetryDelayMs);
    return () => { active = false; if (timer !== undefined) window.clearTimeout(timer); };
  }, [page, historyState]);

  useEffect(() => {
    const api = window.lolViewer;
    if (!api) return;
    void Promise.resolve(api.getSettings()).then((value) => { if (value) setSettings(value); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (page !== 'live') return;
    let active = true;
    const api = window.lolViewer;
    if (!api) { setLiveRequesting(false); setLiveState('error'); return; }
    const currentGeneration = ++generation.current;
    setLiveRequesting(true);
    liveRequestingRef.current = true;
    setMatch(undefined);
    liveSnapshotRef.current = false;
    setProgress([]);
    setLiveState('waiting');
    const unsubscribe = api.onPlayerUpdated((player, eventGeneration = currentGeneration) => {
      if (!active || eventGeneration !== currentGeneration || player.scope !== 'all') return;
      setProgress((current) => [...current.filter((entry) => entry.playerId !== player.playerId), player]);
      setLiveState('ready');
    });
    void api.getLiveMatch('all', currentGeneration).then((next) => {
      if (!active || currentGeneration !== generation.current) return;
      setMatch(next); liveSnapshotRef.current = true; setProgress([]); setLiveState('ready');
    }).catch(() => { if (active && currentGeneration === generation.current && !match) setLiveState('error'); }).finally(() => {
      if (active && currentGeneration === generation.current) { setLiveRequesting(false); liveRequestingRef.current = false; }
    });
    return () => {
      active = false;
      unsubscribe();
      void Promise.resolve(api.cancelLiveMatch?.()).catch(() => undefined);
    };
  }, [page, retryNonce]);

  useEffect(() => {
    if (page !== 'live') return;
    let active = true;
    let previousPhase: string | undefined;
    const checkPhase = async () => {
      const api = window.lolViewer;
      if (!api) return;
      try {
        const identity = await api.getGameflowSessionIdentity();
        const phase = identity.phase;
        if (!active) return;
        const isActive = activePhases.has(phase);
        const enteredChampionSelect = previousPhase !== undefined && phase === 'ChampSelect' && previousPhase !== 'ChampSelect';
        const gameIdChanged = identity.gameId !== undefined && currentGameIdRef.current !== undefined && identity.gameId !== currentGameIdRef.current;
        previousPhase = phase;
        if (identity.gameId !== undefined) currentGameIdRef.current = identity.gameId;
        if ((gameIdChanged || enteredChampionSelect) && liveSnapshotRef.current && !liveRequestingRef.current) {
          generation.current += 1;
          liveSnapshotRef.current = false;
          setMatch(undefined);
          setProgress([]);
          setLiveState('waiting');
          setRetryNonce((value) => value + 1);
        } else if (!isActive && (liveSnapshotRef.current || liveRequestingRef.current)) {
          generation.current += 1;
          liveSnapshotRef.current = false;
          liveRequestingRef.current = false;
          setMatch(undefined);
          setProgress([]);
          setLiveRequesting(false);
          setLiveState('waiting');
          void Promise.resolve(api.cancelLiveMatch?.()).catch(() => undefined);
        } else if (isActive && !liveSnapshotRef.current && !liveRequestingRef.current) {
          setRetryNonce((value) => value + 1);
        }
      } catch {
        // The League client can briefly disappear between games; keep the last stable UI.
      }
    };
    const timer = window.setInterval(() => void checkPhase(), 3_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [page]);
  useEffect(() => {
    let active = true;
    let previousPhase: string | undefined;
    const checkPhase = async (): Promise<void> => {
      if (!active || pageRef.current === 'live') return;
      const api = window.lolViewer;
      if (!api) return;
      try {
        const identity = await api.getGameflowSessionIdentity();
        if (!active) return;
        const phase = identity.phase;
        const isActive = activePhases.has(phase);
        const enteredActivePhase = previousPhase !== undefined && isActive && previousPhase !== phase;
        previousPhase = phase;
        if (enteredActivePhase) setLiveAttention(true);
        else if (!isActive) setLiveAttention(false);
      } catch {
        // League client is unavailable; keep the current tab state.
      }
    };
    const timer = window.setInterval(() => void checkPhase(), clientRetryDelayMs);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    if (page !== 'live' || liveRequesting || liveState !== 'error' || match || progress.length > 0) return;
    const timer = window.setTimeout(() => setRetryNonce((value) => value + 1), 3_000);
    return () => window.clearTimeout(timer);
  }, [page, liveRequesting, liveState, match, progress.length]);

  const handleTabChange = (tab: AppTab): void => {
    setPage(tab);
    if (tab === 'live') setLiveAttention(false);
  };

  const refreshHistory = async () => {
    if (historyRefreshingRef.current || !window.lolViewer) return;
    historyRefreshingRef.current = true;
    setHistoryRefreshing(true);
    setHistoryRefreshError('');
    try {
      const snapshot = await window.lolViewer.getPersonalHistory();
      if (!snapshot) throw new Error('History unavailable');
      setHistory(snapshot);
      setHistoryState('ready');
    } catch {
      setHistoryRefreshError('刷新失败，请重试');
    } finally {
      historyRefreshingRef.current = false;
      setHistoryRefreshing(false);
    }
  };
  const clearCache = async () => { setMessage('Clearing cache…'); try { await window.lolViewer?.clearCache(); setMessage('Cache cleared'); } catch { setMessage('Cache could not be cleared'); } };
  const updateLaneSetting = async (showLaneDifferences: boolean) => {
    try { const next = await window.lolViewer?.updateSettings({ showLaneDifferences }); if (next) setSettings(next); } catch { setMessage('Settings could not be saved'); }
  };
  const updateAutoAcceptSetting = async (autoAcceptReadyCheck: boolean) => {
    try { const next = await window.lolViewer?.updateSettings({ autoAcceptReadyCheck }); if (next) setSettings(next); } catch { setMessage('Settings could not be saved'); }
  };
  const getChampionGuide = useCallback((id: Parameters<LolViewerApi['getChampionGuide']>[0], lane: Parameters<LolViewerApi['getChampionGuide']>[1]) =>
    window.lolViewer?.getChampionGuide(id, lane) ?? Promise.reject(new Error('unavailable')), []);
  const getChampionCatalog = useCallback(() => window.lolViewer?.getChampionCatalog() ?? Promise.reject(new Error('unavailable')), []);
  const getChampionDetails = useCallback((id: number) => window.lolViewer?.getChampionDetails(id) ?? Promise.reject(new Error('unavailable')), []);
  const liveNotice = liveState === 'waiting'
    ? <p role="status" className="live-match-page__notice">等待进入英雄选择或游戏</p>
    : liveState === 'error'
      ? <p role="alert" className="live-match-page__notice live-match-page__notice--error">对战信息暂时无法读取，请重试</p>
      : null;

  const content = <>
    <div hidden={page !== 'history'}><PersonalHistoryPage snapshot={history} state={historyState} onRefresh={() => void refreshHistory()} refreshing={historyRefreshing} refreshError={historyRefreshError} /></div>
    <div hidden={page !== 'live'}><LiveMatchPage match={match} players={match ? undefined : progress} showLaneDifferences={settings.showLaneDifferences} notice={liveNotice} /></div>
    {page === 'champions' && <ChampionLibraryPage getCatalog={getChampionCatalog} getDetails={getChampionDetails} getGuide={getChampionGuide} />}
    {page === 'settings' && <SettingsPage settings={settings} message={message} onAutoAcceptChange={(checked) => void updateAutoAcceptSetting(checked)} onLaneDifferencesChange={(checked) => void updateLaneSetting(checked)} onClearCache={() => void clearCache()} />}
  </>;
  return <AppShell active={page} onChange={handleTabChange} liveAttention={liveAttention}>{content}</AppShell>;
}

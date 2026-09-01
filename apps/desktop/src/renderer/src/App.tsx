import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { PersonalHistorySnapshot } from '../../shared/domain';
import type { AppSettings, LolViewerApi, PersonalHistoryTarget } from '../../shared/ipc';
import AppShell, { type AppTab } from './AppShell';
import ChampionLibraryPage from './features/champions/ChampionLibraryPage';
import PersonalHistoryPage from './features/history/PersonalHistoryPage';
import LiveMatchPage from './features/live/LiveMatchPage';
import { initialLiveMatchState, liveMatchReducer, type LiveMatchAction } from './features/live/live-match-state';
import SettingsPage from './features/settings/SettingsPage';

declare global { interface Window { lolViewer?: LolViewerApi } }

const defaults: AppSettings = { queueScope: 'ranked-solo', autoOpenLiveMatch: true, showLaneDifferences: true, autoAcceptReadyCheck: false };
const activePhases = new Set(['ChampSelect', 'GameStart', 'InProgress', 'Reconnect']);
const clientRetryDelayMs = 3_000;

export default function App({ initialTab = 'history' }: { initialTab?: AppTab } = {}) {
  const [page, setPage] = useState<AppTab>(initialTab);
  const [history, setHistory] = useState<PersonalHistorySnapshot>();
  const [historyTarget, setHistoryTarget] = useState<PersonalHistoryTarget>();
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyRefreshError, setHistoryRefreshError] = useState('');
  const [liveView, dispatchLiveView] = useReducer(liveMatchReducer, initialLiveMatchState);
  const [liveAttention, setLiveAttention] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(defaults);
  const [message, setMessage] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const hasLiveMatch = liveView.match !== undefined;
  const generation = useRef(0);
  const pageRef = useRef(page);
  const historyRequest = useRef<Promise<PersonalHistorySnapshot> | undefined>(undefined);
  const ownHistoryRef = useRef<PersonalHistorySnapshot | undefined>(undefined);
  const historyNavigation = useRef(0);
  const historyRefreshingRef = useRef(false);
  const liveViewRef = useRef(liveView);
  const currentGameIdRef = useRef<string | undefined>(undefined);
  const dispatchLive = useCallback((action: LiveMatchAction): void => {
    liveViewRef.current = liveMatchReducer(liveViewRef.current, action);
    dispatchLiveView(action);
  }, []);

  useEffect(() => {
    if (page !== 'history' || historyTarget) return;
    let active = true;
    const api = window.lolViewer;
    if (!api) { setHistoryState('unavailable'); return; }
    const request = historyRequest.current ?? Promise.resolve(api.getPersonalHistory());
    historyRequest.current = request;
    void request.then((snapshot) => {
      if (!active) return;
      if (!snapshot) { if (!history) setHistoryState('unavailable'); return; }
      ownHistoryRef.current = snapshot; setHistory(snapshot); setHistoryState('ready');
    }).catch(() => { if (active && !history) setHistoryState('unavailable'); }).finally(() => {
      if (historyRequest.current === request) historyRequest.current = undefined;
    });
    return () => { active = false; };
  }, [page, historyTarget]);

  useEffect(() => { pageRef.current = page; }, [page]);

  useEffect(() => {
    if (page !== 'history' || historyTarget || historyState !== 'unavailable' || !window.lolViewer) return;
    let active = true;
    let timer: number | undefined;
    const poll = async (): Promise<void> => {
      if (!active || !window.lolViewer) return;
      try {
        const snapshot = await window.lolViewer.getPersonalHistory();
        if (!active) return;
        if (snapshot) { ownHistoryRef.current = snapshot; setHistory(snapshot); setHistoryState('ready'); return; }
      } catch {
        // The League client is still starting; retry shortly.
      }
      if (active) timer = window.setTimeout(() => void poll(), clientRetryDelayMs);
    };
    timer = window.setTimeout(() => void poll(), clientRetryDelayMs);
    return () => { active = false; if (timer !== undefined) window.clearTimeout(timer); };
  }, [page, historyState, historyTarget]);

  useEffect(() => {
    const api = window.lolViewer;
    if (!api) return;
    void Promise.resolve(api.getSettings()).then((value) => { if (value) setSettings(value); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (page !== 'live') return;
    let active = true;
    const api = window.lolViewer;
    if (!api) { dispatchLive({ type: 'request-failed' }); return; }
    const currentGeneration = ++generation.current;
    dispatchLive({ type: 'request-started' });
    const unsubscribe = api.onPlayerUpdated((player, eventGeneration = currentGeneration) => {
      if (!active || eventGeneration !== currentGeneration || player.scope !== 'all') return;
      dispatchLive({ type: 'player-updated', player });
    });
    void api.getLiveMatch('all', currentGeneration).then((next) => {
      if (!active || currentGeneration !== generation.current) return;
      dispatchLive({ type: 'request-succeeded', match: next });
    }).catch(() => {
      if (active && currentGeneration === generation.current) dispatchLive({ type: 'request-failed' });
    });
    return () => {
      active = false;
      unsubscribe();
      void Promise.resolve(api.cancelLiveMatch?.()).catch(() => undefined);
    };
  }, [dispatchLive, page, retryNonce]);

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
        const gameIdChanged = isActive && identity.gameId !== undefined && currentGameIdRef.current !== undefined && identity.gameId !== currentGameIdRef.current;
        previousPhase = phase;
        if (isActive && identity.gameId !== undefined) currentGameIdRef.current = identity.gameId;
        if ((gameIdChanged || enteredChampionSelect) && liveViewRef.current.match && !liveViewRef.current.requesting) {
          generation.current += 1;
          dispatchLive({ type: 'new-match-detected', phase });
          setRetryNonce((value) => value + 1);
        } else {
          dispatchLive({ type: 'phase-observed', phase, active: isActive });
          if (isActive && !liveViewRef.current.match && !liveViewRef.current.requesting) {
            setRetryNonce((value) => value + 1);
          }
        }
      } catch {
        // The League client can briefly disappear between games; keep the last stable UI.
      }
    };
    const timer = window.setInterval(() => void checkPhase(), 3_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [dispatchLive, page]);
  useEffect(() => {
    if (page !== 'live' || liveView.phase !== 'ChampSelect' || !hasLiveMatch) return;
    const api = window.lolViewer;
    if (!api) return;
    let active = true;
    let requesting = false;
    const refreshRoster = async (): Promise<void> => {
      if (!active || requesting) return;
      requesting = true;
      try {
        const roster = await api.getLiveRoster();
        if (active) dispatchLive({ type: 'roster-refreshed', roster });
      } catch {
        // Champion-select data can be briefly incomplete while players join.
      } finally {
        requesting = false;
      }
    };
    void refreshRoster();
    const timer = window.setInterval(() => void refreshRoster(), 1_500);
    return () => { active = false; window.clearInterval(timer); };
  }, [dispatchLive, hasLiveMatch, liveView.phase, page]);
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
    if (page !== 'live' || liveView.requesting || liveView.status !== 'error' || liveView.match || liveView.progress.length > 0) return;
    const timer = window.setTimeout(() => setRetryNonce((value) => value + 1), 3_000);
    return () => window.clearTimeout(timer);
  }, [page, liveView.match, liveView.progress.length, liveView.requesting, liveView.status]);

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
      const snapshot = await window.lolViewer.getPersonalHistory(historyTarget);
      if (!snapshot) throw new Error('History unavailable');
      if (!historyTarget) ownHistoryRef.current = snapshot;
      setHistory(snapshot);
      setHistoryState('ready');
    } catch {
      setHistoryRefreshError('刷新失败，请重试');
    } finally {
      historyRefreshingRef.current = false;
      setHistoryRefreshing(false);
    }
  };
  const viewPlayerHistory = async (target: PersonalHistoryTarget): Promise<void> => {
    const api = window.lolViewer;
    if (!api || target.playerId === history?.playerId) return;
    const requestId = ++historyNavigation.current;
    setHistoryTarget(target);
    setHistory(undefined);
    setHistoryRefreshError('');
    setHistoryState('loading');
    try {
      const snapshot = await api.getPersonalHistory(target);
      if (requestId !== historyNavigation.current) return;
      setHistory(snapshot);
      setHistoryState('ready');
    } catch {
      if (requestId !== historyNavigation.current) return;
      setHistoryState('unavailable');
    }
  };
  const returnToOwnHistory = (): void => {
    historyNavigation.current += 1;
    setHistoryTarget(undefined);
    setHistory(ownHistoryRef.current);
    setHistoryState(ownHistoryRef.current ? 'ready' : 'loading');
    setHistoryRefreshError('');
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
  const liveNotice = liveView.status === 'error'
      ? <p role="alert" className="live-match-page__notice live-match-page__notice--error">对战信息暂时无法读取，请重试</p>
      : !liveView.match && liveView.progress.length === 0
        ? <p role="status" className="live-match-page__notice">{liveView.status === 'new-match-loading' ? '检测到新对局，正在加载阵容' : '等待进入英雄选择或游戏'}</p>
        : null;

  const content = <>
    <div hidden={page !== 'history'}><PersonalHistoryPage snapshot={history} state={historyState} onRefresh={() => void refreshHistory()} onPlayerSelect={(target) => void viewPlayerHistory(target)} onBack={historyTarget ? returnToOwnHistory : undefined} refreshing={historyRefreshing} refreshError={historyRefreshError} /></div>
    <div hidden={page !== 'live'}><LiveMatchPage match={liveView.match} players={liveView.match ? undefined : liveView.progress} lifecycleStatus={liveView.status} gameflowPhase={liveView.phase} showLaneDifferences={settings.showLaneDifferences} notice={liveNotice} /></div>
    {page === 'champions' && <ChampionLibraryPage getCatalog={getChampionCatalog} getDetails={getChampionDetails} getGuide={getChampionGuide} />}
    {page === 'settings' && <SettingsPage settings={settings} message={message} onAutoAcceptChange={(checked) => void updateAutoAcceptSetting(checked)} onLaneDifferencesChange={(checked) => void updateLaneSetting(checked)} onClearCache={() => void clearCache()} />}
  </>;
  return <AppShell active={page} onChange={handleTabChange} liveAttention={liveAttention}>{content}</AppShell>;
}

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { PersonalHistorySnapshot } from '../../shared/domain';
import type { AppSettings, LolViewerApi, PersonalHistoryTarget } from '../../shared/ipc';
import AppShell, { type AppTab } from './AppShell';
import { DonationControl } from './features/donation/DonationControl';
import { UpdateControl } from './features/updates/UpdateControl';
import ChampionLibraryPage from './features/champions/ChampionLibraryPage';
import PersonalHistoryPage from './features/history/PersonalHistoryPage';
import PlayerSearch from './features/history/PlayerSearch';
import LiveMatchPage from './features/live/LiveMatchPage';
import { initialLiveMatchState, liveMatchReducer, type LiveMatchAction, type LiveMatchErrorReason } from './features/live/live-match-state';
import SettingsPage from './features/settings/SettingsPage';
import FeedbackDialog from './features/feedback/FeedbackDialog';

declare global { interface Window { lolViewer?: LolViewerApi } }

const defaults: AppSettings = { autoOpenLiveMatch: true, showLaneDifferences: true, autoAcceptReadyCheck: false };
const activePhases = new Set(['ChampSelect', 'GameStart', 'InProgress', 'Reconnect']);
const clientRetryDelayMs = 3_000;
const inGamePollDelayMs = 15_000;

function liveErrorReason(error: unknown): LiveMatchErrorReason {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes('league client') || message.includes('lcu is unavailable') || message.includes('lcu authentication')) return 'client-unavailable';
  if (message.includes('roster is incomplete') || message.includes('champ-select') || message.includes('not in game') || message.includes('no active')) return 'not-in-match';
  return 'data-unavailable';
}

function LiveStateNotice({
  kind,
  title,
  detail,
  alert = false
}: {
  kind: 'waiting' | 'loading' | 'paused' | 'error';
  title: string;
  detail?: string;
  alert?: boolean;
}) {
  return <div role={alert ? 'alert' : 'status'} className={`live-match-page__notice live-match-page__notice--${kind}`}><span className="live-match-page__notice-icon" aria-hidden="true"><i /></span><div><strong>{title}</strong>{detail && <p>{detail}</p>}</div></div>;
}

export default function App({ initialTab = 'history' }: { initialTab?: AppTab } = {}) {
  const [page, setPage] = useState<AppTab>(initialTab);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [clipboardNotice, setClipboardNotice] = useState(false);
  const [history, setHistory] = useState<PersonalHistorySnapshot>();
  const [historyTarget, setHistoryTarget] = useState<PersonalHistoryTarget>();
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [historyRefreshing, setHistoryRefreshing] = useState(false);
  const [historyRefreshError, setHistoryRefreshError] = useState('');
  const [liveView, dispatchLiveView] = useReducer(liveMatchReducer, initialLiveMatchState);
  const [liveAttention, setLiveAttention] = useState(false);
  const [updatePhase, setUpdatePhase] = useState<string | undefined>(undefined);
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
  const settingsRef = useRef(settings);
  const currentGameIdRef = useRef<string | undefined>(undefined);
  const loadedGameIdRef = useRef<string | undefined>(undefined);
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
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = window.lolViewer?.onEnemyHistoryCopied?.(() => {
      setClipboardNotice(true);
      clearTimeout(timer);
      timer = setTimeout(() => setClipboardNotice(false), 5000);
    });
    return () => { unsubscribe?.(); clearTimeout(timer); };
  }, []);

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
    void Promise.resolve(api.getSettings()).then((value) => { if (value) { settingsRef.current = value; setSettings(value); } }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (page !== 'live') return;
    if (
      liveViewRef.current.match &&
      loadedGameIdRef.current !== undefined &&
      loadedGameIdRef.current === currentGameIdRef.current
    ) return;
    if (
      liveViewRef.current.status === 'paused' &&
      (liveViewRef.current.phase === 'GameStart' || liveViewRef.current.phase === 'InProgress')
    ) return;
    let active = true;
    const api = window.lolViewer;
    if (!api) { dispatchLive({ type: 'request-failed', reason: 'client-unavailable' }); return; }
    const currentGeneration = ++generation.current;
    dispatchLive({ type: 'request-started' });
    const unsubscribe = api.onPlayerUpdated((player, eventGeneration = currentGeneration) => {
      if (!active || currentGeneration !== generation.current || eventGeneration !== currentGeneration || player.scope !== 'all') return;
      dispatchLive({ type: 'player-updated', player });
    });
    void api.getLiveMatch('all', currentGeneration).then((next) => {
      if (!active || currentGeneration !== generation.current) return;
      if (next.gameId) {
        loadedGameIdRef.current = next.gameId;
        currentGameIdRef.current = next.gameId;
      }
      dispatchLive({ type: 'request-succeeded', match: next });
    }).catch((error: unknown) => {
      if (active && currentGeneration === generation.current) dispatchLive({ type: 'request-failed', reason: liveErrorReason(error) });
    });
    return () => {
      active = false;
      unsubscribe();
      void Promise.resolve(api.cancelLiveMatch?.()).catch(() => undefined);
    };
  }, [dispatchLive, page, retryNonce]);

  useEffect(() => {
    let active = true;
    let previousPhase: string | undefined;
    let timer: number | undefined;
    const schedule = (delayMs: number): void => {
      if (active) timer = window.setTimeout(() => void checkPhase(), delayMs);
    };
    const checkPhase = async (): Promise<void> => {
      const api = window.lolViewer;
      if (!active) return;
      if (!api) {
        schedule(clientRetryDelayMs);
        return;
      }
      let nextDelay = clientRetryDelayMs;
      try {
        const identity = await api.getGameflowSessionIdentity();
        if (!active) return;
        const phase = identity.phase;
        setUpdatePhase(phase);
        const isActive = activePhases.has(phase);
        const enteredChampionSelect = previousPhase !== undefined && phase === 'ChampSelect' && previousPhase !== 'ChampSelect';
        const gameIdChanged = isActive && identity.gameId !== undefined && currentGameIdRef.current !== undefined && identity.gameId !== currentGameIdRef.current;
        const enteredActivePhase = isActive && (previousPhase === undefined || !activePhases.has(previousPhase));
        previousPhase = phase;
        nextDelay = phase === 'InProgress' ? inGamePollDelayMs : clientRetryDelayMs;
        if (isActive && identity.gameId !== undefined) currentGameIdRef.current = identity.gameId;

        if (pageRef.current === 'live') {
          if (!isActive) {
            if (liveViewRef.current.requesting) {
              generation.current += 1;
              void Promise.resolve(api.cancelLiveMatch?.()).catch(() => undefined);
            }
            dispatchLive({ type: 'phase-observed', phase, active: false, connected: identity.connected });
          } else if (gameIdChanged || enteredChampionSelect) {
            generation.current += 1;
            loadedGameIdRef.current = undefined;
            if (liveViewRef.current.requesting) {
              void Promise.resolve(api.cancelLiveMatch?.()).catch(() => undefined);
            }
            dispatchLive({ type: 'new-match-detected', phase });
            setRetryNonce((value) => value + 1);
          } else if (
            liveViewRef.current.requesting &&
            (phase === 'GameStart' || phase === 'InProgress')
          ) {
            generation.current += 1;
            void Promise.resolve(api.cancelLiveMatch?.()).catch(() => undefined);
            dispatchLive({ type: 'enrichment-paused', phase });
          } else {
            dispatchLive({ type: 'phase-observed', phase, active: isActive });
            if (
              isActive &&
              !liveViewRef.current.match &&
              !liveViewRef.current.requesting &&
              liveViewRef.current.status !== 'paused'
            ) {
              setRetryNonce((value) => value + 1);
            }
          }
        } else if (enteredActivePhase && settingsRef.current.autoOpenLiveMatch) {
          pageRef.current = 'live';
          setPage('live');
          setLiveAttention(false);
        } else if (enteredActivePhase) {
          setLiveAttention(true);
        } else if (!isActive) {
          setLiveAttention(false);
        }
      } catch (error) {
        // Preserve completed snapshots, but never leave an empty page loading forever.
        if (active) setUpdatePhase(undefined);
        if (active && pageRef.current === 'live' && !liveViewRef.current.match) {
          generation.current += 1;
          void Promise.resolve(window.lolViewer?.cancelLiveMatch?.()).catch(() => undefined);
          dispatchLive({ type: 'request-failed', reason: liveErrorReason(error) });
        }
      } finally {
        schedule(nextDelay);
      }
    };
    schedule(clientRetryDelayMs);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [dispatchLive]);
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
    if (page !== 'live' || liveView.requesting || liveView.status !== 'error' || liveView.match || liveView.progress.length > 0) return;
    const timer = window.setTimeout(
      () => setRetryNonce((value) => value + 1),
      liveView.phase === 'InProgress' ? inGamePollDelayMs : clientRetryDelayMs
    );
    return () => window.clearTimeout(timer);
  }, [page, liveView.match, liveView.phase, liveView.progress.length, liveView.requesting, liveView.status]);

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
  const clearCache = async () => { setMessage('正在清理缓存…'); try { await window.lolViewer?.clearCache(); setMessage('缓存已清理'); } catch { setMessage('清理失败，请重试'); } };
  const updateAutoAcceptSetting = async (autoAcceptReadyCheck: boolean) => {
    try { const next = await window.lolViewer?.updateSettings({ autoAcceptReadyCheck }); if (next) { settingsRef.current = next; setSettings(next); } } catch { setMessage('设置保存失败，请重试'); }
  };
  const updateGameTextInputSetting = async (gameTextInput: boolean) => {
    try {
      const next = await window.lolViewer?.updateSettings({ gameTextInput });
      if (next) { settingsRef.current = next; setSettings(next); setMessage(gameTextInput ? '游戏内填入已开启' : '游戏内填入已关闭'); }
    } catch { setMessage('无法开启：仅支持 Windows，请检查快捷键是否被占用。'); }
  };

  const updateAutoCopySetting = async (autoCopyEnemyHistory: boolean) => {
    try {
      const next = await window.lolViewer?.updateSettings({ autoCopyEnemyHistory });
      if (next) { settingsRef.current = next; setSettings(next); setMessage(autoCopyEnemyHistory ? '自动复制已开启' : '自动复制已关闭'); }
    } catch { setMessage('设置保存失败，请重试'); }
  };
  const updateAutoOpenSetting = async (autoOpenLiveMatch: boolean) => {
    try { const next = await window.lolViewer?.updateSettings({ autoOpenLiveMatch }); if (next) { settingsRef.current = next; setSettings(next); } } catch { setMessage('设置保存失败，请重试'); }
  };
  const getChampionGuide = useCallback((id: Parameters<LolViewerApi['getChampionGuide']>[0], lane: Parameters<LolViewerApi['getChampionGuide']>[1]) =>
    window.lolViewer?.getChampionGuide(id, lane) ?? Promise.reject(new Error('unavailable')), []);
  const getChampionCatalog = useCallback(() => window.lolViewer?.getChampionCatalog() ?? Promise.reject(new Error('unavailable')), []);
  const getChampionDetails = useCallback((id: number) => window.lolViewer?.getChampionDetails(id) ?? Promise.reject(new Error('unavailable')), []);
  const liveErrorMessages: Record<LiveMatchErrorReason, string> = {
    'client-unavailable': '未连接英雄联盟客户端',
    'not-in-match': '暂未获取到对局信息',
    'data-unavailable': '对战信息暂时无法读取'
  };
  const liveNotice = liveView.status === 'disconnected'
      ? <LiveStateNotice kind="waiting" title="未连接英雄联盟客户端" detail="请先启动并登录英雄联盟客户端。" />
      : liveView.status === 'loading' && !liveView.match && liveView.progress.length === 0
      ? <LiveStateNotice kind="loading" title={liveView.phase && activePhases.has(liveView.phase) ? '正在读取对局阵容' : '正在检测客户端与对局状态'} />
      : liveView.status === 'error'
      ? <LiveStateNotice kind="error" alert title={liveErrorMessages[liveView.errorReason ?? 'data-unavailable']} detail={liveView.errorReason === 'client-unavailable' ? '请先启动并登录英雄联盟客户端。' : '正在重试，请稍候。'} />
      : liveView.status === 'paused'
        ? <LiveStateNotice kind="paused" title="游戏中，战绩更新已暂停" detail="已加载的战绩仍可查看，下局恢复更新。" />
      : !liveView.match && liveView.progress.length === 0 && (liveView.status === 'waiting' || liveView.status === 'new-match-loading')
        ? <LiveStateNotice kind={liveView.status === 'new-match-loading' ? 'loading' : 'waiting'} title={liveView.status === 'new-match-loading' ? '检测到新对局，正在加载阵容' : '等待进入英雄选择或游戏'} />
        : null;

  const content = <>
    <div hidden={page !== 'history'}><PlayerSearch onSelect={viewPlayerHistory} onBack={historyTarget ? returnToOwnHistory : undefined} /><PersonalHistoryPage snapshot={history} state={historyState} onRefresh={() => void refreshHistory()} onPlayerSelect={(target) => void viewPlayerHistory(target)} onBack={historyTarget ? returnToOwnHistory : undefined} refreshing={historyRefreshing} refreshError={historyRefreshError} /></div>
    <div hidden={page !== 'live'}><LiveMatchPage match={liveView.match} players={liveView.match ? undefined : liveView.progress} loadingProgress={liveView.requesting && !liveView.match && (liveView.progress.length > 0 || (liveView.phase !== undefined && activePhases.has(liveView.phase))) ? liveView.progress.length : undefined} lifecycleStatus={liveView.status} gameflowPhase={liveView.phase} showLaneDifferences={settings.showLaneDifferences} notice={liveNotice} /></div>
    {page === 'champions' && <ChampionLibraryPage getCatalog={getChampionCatalog} getDetails={getChampionDetails} getGuide={getChampionGuide} />}
    {page === 'settings' && <SettingsPage onGameTextInputChange={(checked) => void updateGameTextInputSetting(checked)} settings={settings} message={message} onAutoCopyEnemyHistoryChange={(checked) => void updateAutoCopySetting(checked)} onAutoOpenChange={(checked) => void updateAutoOpenSetting(checked)} onAutoAcceptChange={(checked) => void updateAutoAcceptSetting(checked)} onClearCache={() => void clearCache()} />}
    {clipboardNotice && <div role="status" className="clipboard-notice">敌方战绩已复制</div>}
  </>;
return <><AppShell active={page} onChange={handleTabChange} liveAttention={liveAttention} support={<><UpdateControl api={window.lolViewer} canAutoPrompt={!feedbackOpen && ['None', 'Lobby', 'EndOfGame'].includes(updatePhase ?? '')} /><DonationControl api={window.lolViewer} /></>} onFeedback={() => setFeedbackOpen(true)}>{content}</AppShell><FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} api={window.lolViewer} /></>;
}

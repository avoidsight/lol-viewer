import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import './app-shell.css';

export type AppTab = 'history' | 'live' | 'champions' | 'settings';
const tabs: ReadonlyArray<{ id: AppTab; label: string }> = [
  { id: 'history', label: '战绩' }, { id: 'live', label: '对战信息' }, { id: 'settings', label: '设置' }
];

export default function AppShell({ active, onChange, children, liveAttention = false, onFeedback, support }: {
  active: AppTab;
  onChange: (tab: AppTab) => void;
  children: ReactNode;
  liveAttention?: boolean;
  onFeedback?: () => void;
  support?: ReactNode;
}) {
  const [selected, setSelected] = useState(active);
  const tabRefs = useRef<Partial<Record<AppTab, HTMLButtonElement>>>({});
  useEffect(() => setSelected(active), [active]);
  const selectAndFocus = (tab: AppTab) => { setSelected(tab); onChange(tab); tabRefs.current[tab]?.focus(); };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: AppTab) => {
    const index = tabs.findIndex(({ id }) => id === tab);
    let target: AppTab | undefined;
    if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length].id;
    if (event.key === 'ArrowLeft') target = tabs[(index - 1 + tabs.length) % tabs.length].id;
    if (event.key === 'Home') target = tabs[0].id;
    if (event.key === 'End') target = tabs[tabs.length - 1].id;
    if (!target) return;
    event.preventDefault(); selectAndFocus(target);
  };
  return <div className="app-shell"><nav className="app-shell__bar" aria-label="主导航"><strong className="app-shell__brand">LOL Viewer</strong><div className="app-shell__tabs" role="tablist" aria-label="功能页面">{tabs.map(({ id, label }) => {
    const attention = liveAttention && id === 'live';
    return <button key={id} ref={(element) => { if (element) tabRefs.current[id] = element; }} id={`tab-${id}`} type="button" role="tab" className={attention ? 'app-shell__tab--attention' : undefined} aria-selected={selected === id} aria-controls={`panel-${id}`} tabIndex={selected === id ? 0 : -1} onClick={() => selectAndFocus(id)} onKeyDown={(event) => handleKeyDown(event, id)}>{label}</button>;
  })}</div><div className="app-shell__actions">{support}{onFeedback && <button type="button" className="app-shell__feedback" onClick={onFeedback}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-5 3v-3H3V4a1 1 0 0 1 1-1Z" /><path d="M6 7h8M6 10h5" /></svg>反馈</button>}</div></nav><div id={`panel-${active}`} role="tabpanel" aria-labelledby={`tab-${active}`}>{children}</div></div>;
}

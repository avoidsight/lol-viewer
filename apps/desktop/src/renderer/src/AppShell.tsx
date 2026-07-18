import type { ReactNode } from 'react';
import './app-shell.css';
export type AppTab = 'history' | 'live' | 'champions';
const tabs: ReadonlyArray<{ id: AppTab; label: string }> = [{ id: 'history', label: '战绩' }, { id: 'live', label: '对战信息' }, { id: 'champions', label: '英雄资料库' }];
export default function AppShell({ active, onChange, children }: { active: AppTab; onChange: (tab: AppTab) => void; children: ReactNode }) {
  return <div className="app-shell"><nav className="app-shell__bar" aria-label="主要导航"><strong className="app-shell__brand">LOL Viewer</strong><div className="app-shell__tabs" role="tablist" aria-label="功能页面">{tabs.map(({ id, label }) => <button key={id} id={`tab-${id}`} type="button" role="tab" aria-selected={active === id} aria-controls={`panel-${id}`} tabIndex={active === id ? 0 : -1} onClick={() => onChange(id)}>{label}</button>)}</div></nav><div id={`panel-${active}`} role="tabpanel" aria-labelledby={`tab-${active}`}>{children}</div></div>;
}

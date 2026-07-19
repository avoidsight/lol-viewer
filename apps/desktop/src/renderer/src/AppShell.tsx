import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import './app-shell.css';

export type AppTab = 'history' | 'live' | 'champions';

const tabs: ReadonlyArray<{ id: AppTab; label: string }> = [
  { id: 'history', label: '战绩' },
  { id: 'live', label: '对战信息' },
  { id: 'champions', label: '英雄资料库' }
];

export default function AppShell({ active, onChange, children }: {
  active: AppTab;
  onChange: (tab: AppTab) => void;
  children: ReactNode;
}) {
  const [selected, setSelected] = useState(active);
  const tabRefs = useRef<Partial<Record<AppTab, HTMLButtonElement>>>({});

  useEffect(() => setSelected(active), [active]);

  const selectAndFocus = (tab: AppTab) => {
    setSelected(tab);
    onChange(tab);
    tabRefs.current[tab]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, tab: AppTab) => {
    const index = tabs.findIndex(({ id }) => id === tab);
    let target: AppTab | undefined;
    if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length].id;
    if (event.key === 'ArrowLeft') target = tabs[(index - 1 + tabs.length) % tabs.length].id;
    if (event.key === 'Home') target = tabs[0].id;
    if (event.key === 'End') target = tabs[tabs.length - 1].id;
    if (!target) return;
    event.preventDefault();
    selectAndFocus(target);
  };

  return <div className="app-shell">
    <nav className="app-shell__bar" aria-label="主要导航">
      <strong className="app-shell__brand">LOL Viewer</strong>
      <div className="app-shell__tabs" role="tablist" aria-label="功能页面">
        {tabs.map(({ id, label }) => <button
          key={id}
          ref={(element) => { if (element) tabRefs.current[id] = element; }}
          id={`tab-${id}`}
          type="button"
          role="tab"
          aria-selected={selected === id}
          aria-controls={`panel-${id}`}
          tabIndex={selected === id ? 0 : -1}
          onClick={() => selectAndFocus(id)}
          onKeyDown={(event) => handleKeyDown(event, id)}
        >{label}</button>)}
      </div>
    </nav>
    <div id={`panel-${active}`} role="tabpanel" aria-labelledby={`tab-${active}`}>
      {children}
    </div>
  </div>;
}

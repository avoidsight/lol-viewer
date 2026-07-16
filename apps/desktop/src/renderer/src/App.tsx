import { useEffect, useState } from 'react';
import type { QueueScope } from '../../shared/domain';
import type { LiveMatch, LolViewerApi } from '../../shared/ipc';
import LiveMatchPage from './features/live/LiveMatchPage';

declare global { interface Window { lolViewer?: LolViewerApi } }

export default function App() {
  const [scope, setScope] = useState<QueueScope>('ranked-solo');
  const [match, setMatch] = useState<LiveMatch | null>(null);

  useEffect(() => {
    let active = true;
    const api = window.lolViewer;
    if (!api) return;
    void api.getLiveMatch(scope).then((nextMatch) => { if (active) setMatch(nextMatch); }).catch(() => { if (active) setMatch(null); });
    return () => { active = false; };
  }, [scope]);

  if (!match) return <main><h1>国服对局查看器</h1><p>等待英雄联盟客户端</p></main>;
  return <LiveMatchPage match={match} scope={scope} onScopeChange={setScope} />;
}

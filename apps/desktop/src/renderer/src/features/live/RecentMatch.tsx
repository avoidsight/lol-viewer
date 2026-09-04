import { useState } from 'react';
import type { MatchSummary } from '../../../../shared/domain';
import { describeQueue } from '../../../../shared/queue';

export default function RecentMatch({ match, assetVersion: _assetVersion }: { match: MatchSummary; assetVersion?: string }) {
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const championLabel = `英雄 ${match.championId}`;
  const matchLabel = `${match.win ? '胜利' : '失败'} · ${describeQueue(match.queueId)} · KDA ${match.kills}/${match.deaths}/${match.assists}`;
  return (
    <li className={`recent-match ${match.win ? 'recent-match--win' : 'recent-match--loss'}`} data-testid="recent-match" aria-label={matchLabel} title={matchLabel}>
      {imageUnavailable ? <span className="recent-match__fallback" role="img" aria-label={`${championLabel}图标不可用`}><b>{match.championId}</b></span> :
        <img className="recent-match__champion" src={`lol-asset://champion-icons/${match.championId}.png`} alt={championLabel} loading="lazy" onError={() => setImageUnavailable(true)} />}
      <span className="recent-match__kda" aria-hidden="true"><b>{match.kills}</b><i>/</i><b>{match.deaths}</b><i>/</i><b>{match.assists}</b></span>
      <span className="recent-match__result" aria-hidden="true" />
    </li>
  );
}

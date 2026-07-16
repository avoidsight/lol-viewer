import { useState } from 'react';
import type { MatchSummary } from '../../../../shared/domain';

export default function RecentMatch({ match }: { match: MatchSummary }) {
  const [imageUnavailable, setImageUnavailable] = useState(false);
  const championLabel = `英雄 ${match.championId}`;
  return (
    <li className={`recent-match ${match.win ? 'recent-match--win' : 'recent-match--loss'}`} data-testid="recent-match">
      {imageUnavailable ? <span className="recent-match__fallback" role="img" aria-label={`${championLabel}图标不可用`}>{match.championId}</span> :
        <img className="recent-match__champion" src={`https://raw.communitydragon.org/${encodeURIComponent(match.gameVersion)}/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${match.championId}.png`} alt={championLabel} loading="lazy" onError={() => setImageUnavailable(true)} />}
      <strong className="recent-match__result">{match.win ? '胜' : '负'}</strong>
      <span className="recent-match__kda" aria-label={`K/D/A ${match.kills}/${match.deaths}/${match.assists}`}>{match.kills}/{match.deaths}/{match.assists}</span>
    </li>
  );
}

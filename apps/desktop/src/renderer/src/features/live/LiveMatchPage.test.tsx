import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Lane, MatchSummary, PlayerSnapshot } from '../../../../shared/domain';
import type { LiveMatch } from '../../../../shared/ipc';
import LiveMatchPage from './LiveMatchPage';

const lanes: Lane[] = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];

function matches(playerIndex: number, count = 10): MatchSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    matchId: `${playerIndex}-${index}`,
    queueId: 420,
    endedAt: 1_700_000_000_000 - index,
    durationSeconds: 1_800,
    championId: playerIndex * 10 + index + 1,
    win: index % 2 === 0,
    kills: index === 0 ? 8 : index,
    deaths: index === 0 ? 3 : 2,
    assists: index === 0 ? 4 : 5
  }));
}

function player(index: number, overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  const history = matches(index);
  return {
    playerId: String(index),
    displayName: `Player ${index}`,
    teamId: index < 5 ? 100 : 200,
    lane: lanes[index % 5],
    championId: index + 1,
    rank: '黄金 I',
    scope: 'ranked-solo',
    matches: history,
    sampleSize: history.length,
    wins: 5,
    losses: 5,
    winRate: 0.5,
    currentChampionGames: 2,
    currentChampionWins: 1,
    currentChampionWinRate: 0.5,
    status: 'ready',
    updatedAt: 1_700_000_000_000,
    ...overrides
  };
}

const fixtureLiveMatch: LiveMatch = {
  players: Array.from({ length: 10 }, (_, index) => player(index))
};

describe('LiveMatchPage', () => {
  it('renders two aligned teams and every available recent match', () => {
    render(<LiveMatchPage match={fixtureLiveMatch} />);

    expect(screen.getAllByTestId('player-card')).toHaveLength(10);
    expect(screen.getAllByTestId('recent-match')).toHaveLength(100);
    expect(screen.getAllByText('8/3/4')).toHaveLength(10);

    const teams = screen.getAllByRole('group', { name: /方队伍/ });
    expect(teams).toHaveLength(2);
    expect(within(teams[0]).getAllByTestId('player-card').map((card) => card.dataset.lane)).toEqual(lanes);
    expect(within(teams[1]).getAllByTestId('player-card').map((card) => card.dataset.lane)).toEqual(lanes);
  });

  it('labels wins and losses with text and exposes champion image alternatives', () => {
    render(<LiveMatchPage match={fixtureLiveMatch} />);

    expect(screen.getAllByText('胜')).toHaveLength(50);
    expect(screen.getAllByText('负')).toHaveLength(50);
    expect(screen.getAllByRole('img', { name: /英雄 \d+/ })).toHaveLength(100);
  });

  it('shows loading, unavailable, and fewer-than-ten states explicitly', () => {
    const partial = matches(2, 3);
    const stateMatch: LiveMatch = {
      players: fixtureLiveMatch.players.map((entry, index) => {
        if (index === 0) return player(index, { status: 'loading', matches: [], sampleSize: 0 });
        if (index === 1) return player(index, { status: 'unavailable', matches: [], sampleSize: 0, error: '暂时无法读取' });
        if (index === 2) return player(index, { matches: partial, sampleSize: partial.length, wins: 2, losses: 1 });
        return entry;
      })
    };

    render(<LiveMatchPage match={stateMatch} />);

    expect(screen.getByText('正在加载战绩…')).toBeVisible();
    expect(screen.getByText('战绩暂不可用：暂时无法读取')).toBeVisible();
    expect(screen.getByText('仅获取到 3/10 场')).toBeVisible();
  });

  it('calls the scope switch callback from accessible controls', () => {
    const onScopeChange = vi.fn();
    render(<LiveMatchPage match={fixtureLiveMatch} scope="ranked-solo" onScopeChange={onScopeChange} />);

    fireEvent.click(screen.getByRole('button', { name: '全部模式' }));
    expect(onScopeChange).toHaveBeenCalledWith('all');
    expect(screen.getByRole('button', { name: '单双排' })).toHaveAttribute('aria-pressed', 'true');
  });
});

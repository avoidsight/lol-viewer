import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PersonalHistorySnapshot } from '../../../../shared/domain';
import PersonalHistoryPage from './PersonalHistoryPage';

const snapshot: PersonalHistorySnapshot = {
  playerId: 'me',
  displayName: '召唤师',
  profileIconId: 12,
  rank: undefined,
  matches: Array.from({ length: 22 }, (_, index) => ({
    matchId: String(index),
    queueId: index % 2 ? 450 : 420,
    endedAt: 1_700_000_000_000 - index,
    durationSeconds: 1200,
    championId: index + 1,
    win: index % 2 === 0,
    kills: 8,
    deaths: 2,
    assists: 6,
    mvp: index === 0 ? true : undefined,
    multiKill: index === 0 ? 3 : undefined,
    cs: 186,
    goldEarned: 12_400,
    totalDamageDealtToChampions: 31_500,
    totalDamageTaken: 28_100,
    teamDamageShare: 0.26,
    teamDamageTakenShare: 0.23,
    teamGoldShare: 0.19,
    itemIds: [3071, 3053, 3340],
    summonerSpellIds: [4, 12],
    allyChampionIds: [index + 1, 101, 102, 103, 104],
    enemyChampionIds: [201, 202, 203, 204, 205],
    allyPlayers: [
      { championId: index + 1, playerId: 'me', displayName: '召唤师' },
      ...Array.from({ length: 4 }, (_, playerIndex) => ({
        championId: 101 + playerIndex,
        playerId: `ally-${index}-${playerIndex}`,
        displayName: `队友 ${playerIndex + 1}`
      }))
    ],
    enemyPlayers: Array.from({ length: 5 }, (_, playerIndex) => ({
      championId: 201 + playerIndex,
      playerId: `enemy-${index}-${playerIndex}`,
      puuid: `enemy-puuid-${index}-${playerIndex}`,
      displayName: `对手 ${playerIndex + 1}`,
      profileIconId: 30 + playerIndex
    })),
    achievements: index === 0 ? [
      { type: 'MOST_KILLS' as const, value: 8 },
      { type: 'MOST_ASSISTS' as const, value: 6 },
      { type: 'MOST_DEATHS' as const, value: 2 },
      { type: 'MOST_DAMAGE' as const, value: 31_500 },
      { type: 'MOST_DAMAGE_TAKEN' as const, value: 28_100 },
      { type: 'MOST_GOLD' as const, value: 12_400 },
      { type: 'MOST_CS' as const, value: 186 }
    ] : undefined
  })),
  sampleSize: 20,
  wins: 12,
  losses: 8,
  winRate: 0.6,
  averageKda: 7,
  favoriteChampions: Array.from({ length: 6 }, (_, index) => ({
    championId: index + 1,
    games: 4,
    wins: 3,
    winRate: 0.75,
    averageKills: 8.3,
    averageDeaths: 4.7,
    averageAssists: 9
  })),
  assetVersion: 'latest',
  itemIconPaths: {
    3071: '/lol-game-data/assets/ASSETS/Items/Icons2D/3071_Fighter_T3_BlackCleaver.png',
    3053: '/lol-game-data/assets/ASSETS/Items/Icons2D/3053_Steraks_Gage.png',
    3340: '/lol-game-data/assets/ASSETS/Items/Icons2D/3340_Class_T1_WardingTotem.png'
  },
  cached: true,
  updatedAt: 1_700_000_000_000
};

describe('PersonalHistoryPage', () => {
  it('sums complete team metrics, preserves zero and hides partial totals', () => {
    const players = snapshot.matches[0].allyPlayers!.map(p => ({ ...p, kills: 0, goldEarned: 10000, deaths: 1, assists: 2 }));
    const { rerender } = render(<PersonalHistoryPage snapshot={{ ...snapshot, matches: [{ ...snapshot.matches[0], allyPlayers: players }] }} state="ready" />);
    expect(screen.getByLabelText('己方详情')).toHaveTextContent('人头 0');
    expect(screen.getByLabelText('己方详情')).toHaveTextContent('总经济 50,000');
    rerender(<PersonalHistoryPage snapshot={{ ...snapshot, matches: [{ ...snapshot.matches[0], allyPlayers: players.slice(0, 4) }] }} state="ready" />);
    expect(screen.getByLabelText('己方详情')).toHaveTextContent('总经济 —');
    expect(screen.getByText('部分玩家详情暂不可用')).toBeVisible();
  });
  it('paginates twenty matches and selects the first match on each page', () => {
    render(<PersonalHistoryPage snapshot={snapshot} state="ready" />);
    expect(screen.getAllByTestId('personal-match')).toHaveLength(10);
    expect(screen.getAllByTestId('personal-match')[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('对局 ID · 0')).toBeVisible();
    fireEvent.click(screen.getAllByTestId('personal-match')[2]);
    expect(screen.getByText('对局 ID · 2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByText('对局 ID · 10')).toBeVisible();
    expect(screen.getAllByTestId('personal-match')).toHaveLength(10);
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '上一页' }));
    expect(screen.getByText('对局 ID · 0')).toBeVisible();
  });
  it('shows bounded text honors and both teams without fabricating missing totals', () => {
    render(<PersonalHistoryPage snapshot={snapshot} state="ready" />);
    expect(screen.getAllByTestId('history-highlight')).toHaveLength(3);
    expect(screen.getByLabelText('己方详情')).toBeVisible();
    expect(screen.getByLabelText('敌方详情')).toBeVisible();
    expect(screen.getAllByRole('row')).toHaveLength(12);
    expect(screen.getByLabelText('敌方详情')).toHaveTextContent('总经济 —');
    expect(screen.queryByText('MVP')).toBeNull();
  });
  it('opens player history from the selected team table', () => {
    const onPlayerSelect = vi.fn();
    render(<PersonalHistoryPage snapshot={snapshot} state="ready" onPlayerSelect={onPlayerSelect} />);
    fireEvent.click(screen.getByRole('button', { name: '对手 1' }));
    expect(onPlayerSelect).toHaveBeenCalledWith({
      playerId: 'enemy-0-0', puuid: 'enemy-puuid-0-0', displayName: '对手 1', profileIconId: 30
    });
    expect(screen.queryByRole('button', { name: '召唤师' })).toBeNull();
  });
  it('resets pagination when filtering and handles empty results', () => {
    render(<PersonalHistoryPage snapshot={snapshot} state="ready" />);
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    fireEvent.click(screen.getByRole('button', { name: '排位' }));
    expect(screen.getByText('1 / 1')).toBeVisible();
    expect(screen.getByText('对局 ID · 0')).toBeVisible();
    fireEvent.change(screen.getByRole('combobox', { name: '胜负筛选' }), { target: { value: 'losses' } });
    expect(screen.queryAllByTestId('personal-match')).toHaveLength(0);
    expect(screen.getByText('暂无对局详情')).toBeVisible();
  });
  it('shows rating only when the required metrics exist', () => {
    const { rerender } = render(<PersonalHistoryPage snapshot={{ ...snapshot, matches: [{ ...snapshot.matches[0], killParticipation: .7 }] }} state="ready" />);
    expect(screen.getByTestId('match-score')).toHaveClass('is-win');
    rerender(<PersonalHistoryPage snapshot={snapshot} state="ready" />);
    expect(screen.queryByTestId('match-score')).toBeNull();
  });
  it('refreshes and shows loading or unavailable states', () => {
    const refresh = vi.fn();
    const { rerender } = render(<PersonalHistoryPage snapshot={snapshot} state="ready" onRefresh={refresh} />);
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(refresh).toHaveBeenCalledOnce();
    rerender(<PersonalHistoryPage state="loading" />);
    expect(screen.getByRole('status')).toHaveTextContent('正在加载个人战绩');
    rerender(<PersonalHistoryPage state="unavailable" />);
    expect(screen.getByRole('alert')).toHaveTextContent('请先启动英雄联盟客户端');
  });
});

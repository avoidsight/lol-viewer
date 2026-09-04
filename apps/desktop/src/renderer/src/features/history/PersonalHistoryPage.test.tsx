import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  it('renders the rich twenty-match dashboard with spells and team compositions', () => {
    render(<PersonalHistoryPage snapshot={snapshot} state="ready" />);

    expect(screen.getByText(/最近 20 场/)).toBeVisible();
    expect(screen.getByText(/未定级/)).toBeVisible();
    expect(screen.getByText('缓存数据')).toBeVisible();
    expect(screen.getAllByTestId('favorite-champion')).toHaveLength(5);
    expect(screen.getAllByTestId('personal-match')).toHaveLength(20);
    expect(screen.getAllByText('极地大乱斗')).toHaveLength(10);
    expect(screen.getAllByLabelText('击杀、死亡、助攻')).toHaveLength(20);
    expect(screen.queryByText(/平均 8\.3/)).not.toBeInTheDocument();
    expect(screen.queryByText('7.00 KDA')).not.toBeInTheDocument();
    expect(screen.queryByText('186 CS')).not.toBeInTheDocument();
    expect(screen.queryByText('31.5k')).not.toBeInTheDocument();
    expect(screen.queryByText('28.1k')).not.toBeInTheDocument();
    expect(screen.queryByText('12.4k')).not.toBeInTheDocument();
    expect(document.querySelector('.personal-history__achievement-icons')).toBeInTheDocument();
    const itemImages = screen.getAllByRole('img', { name: /装备/ });
    expect(itemImages).toHaveLength(40);
    expect(screen.queryByRole('img', { name: '装备 3340' })).not.toBeInTheDocument();
    expect(itemImages[0]).toHaveAttribute(
      'src',
      'lol-asset://game-data/%2Flol-game-data%2Fassets%2FASSETS%2FItems%2FIcons2D%2F3071_Fighter_T3_BlackCleaver.png'
    );
    expect(screen.getAllByRole('img', { name: '召唤师技能 4' })).toHaveLength(20);
    expect(screen.getAllByRole('img', { name: '召唤师技能 12' })).toHaveLength(20);
    expect(screen.getAllByTestId('team-composition')).toHaveLength(20);
    expect(screen.getAllByRole('img', { name: /己方英雄/ })).toHaveLength(100);
    expect(screen.getAllByRole('img', { name: /敌方英雄/ })).toHaveLength(100);
    expect(document.querySelectorAll('.personal-history__team-icon.is-local')).toHaveLength(20);
    expect(screen.getByRole('img', { name: '击杀最多' })).toBeVisible();
    expect(screen.getByRole('img', { name: '助攻最多' })).toBeVisible();
    expect(screen.getByRole('img', { name: '死亡最多' })).toBeVisible();
    expect(screen.getByRole('img', { name: '伤害最高' })).toBeVisible();
    expect(screen.getByRole('img', { name: '承伤最高' })).toBeVisible();
    expect(screen.getByRole('img', { name: '经济最高' })).toBeVisible();
    expect(screen.getByRole('img', { name: '补刀最多' })).toBeVisible();
    expect(screen.getByText('三杀')).toBeVisible();
    expect(screen.getAllByTestId('multi-kill-badge')).toHaveLength(1);
    expect(screen.getByText('MVP')).toBeVisible();
    expect(screen.getAllByTestId('mvp-badge')).toHaveLength(1);
  });

  it('organizes the dashboard into a compact overview, horizontal favorites, and full-width matches', () => {
    const { container } = render(<PersonalHistoryPage snapshot={snapshot} state="ready" />);
    expect(container.querySelector('.personal-history__hero')).toBeInTheDocument();
    expect(container.querySelector('.personal-history__hero-avatar')).toHaveAttribute('src');
    expect(container.querySelector('.personal-history__win-rate')).toHaveTextContent('60.0%');
    expect(container.querySelector('.personal-history__record')).toHaveAccessibleName('12 胜 8 负');
    expect(container.querySelector('.personal-history__quickbar')).toBeInTheDocument();
    expect(container.querySelector('.personal-history__favorites')).toBeInTheDocument();
    expect(container.querySelector('.personal-history__matches-panel')).toBeInTheDocument();
  });

  it('opens another player history from a clickable team champion portrait', () => {
    const onPlayerSelect = vi.fn();
    render(<PersonalHistoryPage snapshot={snapshot} state="ready" onPlayerSelect={onPlayerSelect} />);

    fireEvent.click(screen.getAllByRole('button', { name: '查看 对手 1 的个人战绩' })[0]);

    expect(onPlayerSelect).toHaveBeenCalledWith({
      playerId: 'enemy-0-0',
      puuid: 'enemy-puuid-0-0',
      displayName: '对手 1',
      profileIconId: 30
    });
    expect(screen.queryByRole('button', { name: '查看 召唤师 的个人战绩' })).not.toBeInTheDocument();
    const css = readFileSync(resolve('src/renderer/src/features/history/personal-history.css'), 'utf8');
    expect(css).toMatch(/\.personal-history__team-player\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;/s);
    expect(css).toMatch(/\.personal-history__team-player--link:focus-visible\s*\{[^}]*outline:\s*2px solid #fbbf24;/s);
  });

  it('shows a return action while viewing another player', () => {
    const onBack = vi.fn();
    render(<PersonalHistoryPage snapshot={snapshot} state="ready" onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: /返回我的战绩/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders an accessible refresh action and inline refresh failure', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(
      <PersonalHistoryPage snapshot={snapshot} state="ready" onRefresh={onRefresh} refreshing={false} />
    );
    fireEvent.click(screen.getByRole('button', { name: '刷新' }));
    expect(onRefresh).toHaveBeenCalledOnce();

    rerender(
      <PersonalHistoryPage snapshot={snapshot} state="ready" onRefresh={onRefresh} refreshing refreshError="刷新失败，请重试" />
    );
    expect(screen.getByRole('button', { name: '刷新中' })).toBeDisabled();
    expect(screen.getByText('刷新失败，请重试')).toHaveAttribute('aria-live', 'polite');
  });

  it('labels match duration explicitly so it is not mistaken for time ago', () => {
    const yesterday = {
      ...snapshot,
      matches: [{
        ...snapshot.matches[0],
        endedAt: new Date('2026-07-29T23:05:00+08:00').getTime()
      }]
    };

    render(<PersonalHistoryPage snapshot={yesterday} state="ready" />);

    expect(screen.getByText('时长 20 分钟')).toBeVisible();
    expect(screen.queryByText('昨天')).not.toBeInTheDocument();
  });

  it('filters the visible history by ranked queue and result', () => {
    render(<PersonalHistoryPage snapshot={snapshot} state="ready" />);
    expect(screen.getAllByTestId('personal-match')).toHaveLength(20);

    fireEvent.click(screen.getByRole('button', { name: '排位' }));
    expect(screen.getAllByTestId('personal-match')).toHaveLength(10);
    expect(screen.queryByText('极地大乱斗')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    fireEvent.change(screen.getByRole('combobox', { name: '胜负筛选' }), { target: { value: 'losses' } });
    expect(screen.getAllByTestId('personal-match')).toHaveLength(10);
    expect(screen.getAllByText('失败')).toHaveLength(10);
    expect(screen.queryByText('胜利')).not.toBeInTheDocument();
  });

  it('keeps each desktop match on one row and only styles highest-performance icons', () => {
    const css = readFileSync(resolve('src/renderer/src/features/history/personal-history.css'), 'utf8');
    expect(css).toMatch(/\.personal-history\s*{[^}]*background:\s*var\(--ui-page-bg\)/i);
    expect(css).toMatch(/\.personal-history__quickbar\s*{[^}]*display:\s*flex/i);
    expect(css).toMatch(/\.personal-history__matches article\s*{[^}]*grid-template-columns:/i);
    expect(css).toMatch(/\.personal-history__match-champion\s*{[^}]*width:\s*60px[^}]*height:\s*60px/i);
    expect(css).toMatch(/\.personal-history__spells\s*{[^}]*flex-direction:\s*column/i);
    expect(css).toMatch(/\.personal-history__multi-kill\s*{[^}]*border-radius:\s*999px/i);
    expect(css).toMatch(/\.personal-history__items\s*{[^}]*display:\s*flex/i);
    expect(css).not.toMatch(/personal-history__items img:nth-child\(n\+4\)/i);
    expect(css).toMatch(/\.personal-history__achievement-icons > span\s*{[^}]*border:\s*1px solid currentColor/i);
    expect(css).toMatch(/\.personal-history__achievement-icons svg\s*{[^}]*stroke:\s*currentColor/i);
    expect(css).not.toMatch(/\.personal-history__performance-metrics/i);
    expect(css).not.toMatch(/\.personal-history__performance-bar/i);
    expect(css).toMatch(/@media\s*\(max-width:\s*1080px\)/i);
    expect(css).toMatch(/@media\s*\(max-width:\s*900px\)/i);
    expect(css).toMatch(/@media\s*\(max-width:\s*780px\)/i);
    expect(css).toMatch(/@media\s*\(max-width:\s*520px\)/i);
  });

  it('renders loading and unavailable states explicitly', () => {
    const { rerender } = render(<PersonalHistoryPage state="loading" />);
    expect(screen.getByRole('status')).toHaveTextContent('正在加载个人战绩…');
    rerender(<PersonalHistoryPage state="unavailable" />);
    expect(screen.getByRole('alert')).toHaveTextContent('请先启动英雄联盟客户端');
  });
});

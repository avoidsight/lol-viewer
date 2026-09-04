import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Lane, MatchSummary, PlayerSnapshot } from '../../../../shared/domain';
import type { LiveMatch } from '../../../../shared/ipc';
import LiveMatchPage, { teamSlots } from './LiveMatchPage';

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
    assetVersion: '15.14.1',
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
  players: Array.from({ length: 10 }, (_, index) => player(index)),
  localTeamId: 100,
  queueId: 420,
  modeName: '单双排',
  positionOrderReliable: true
};

describe('LiveMatchPage', () => {
  it('labels champion select, in-game, previous-match, and new-match states', () => {
    const { rerender } = render(<LiveMatchPage match={fixtureLiveMatch} lifecycleStatus="current" gameflowPhase="ChampSelect" />);
    expect(screen.getByText('英雄选择中')).toBeVisible();
    rerender(<LiveMatchPage match={fixtureLiveMatch} lifecycleStatus="current" gameflowPhase="InProgress" />);
    expect(screen.getByText('游戏进行中')).toBeVisible();
    rerender(<LiveMatchPage match={fixtureLiveMatch} lifecycleStatus="last-match" gameflowPhase="EndOfGame" />);
    expect(screen.getByText('上一局记录')).toBeVisible();
    rerender(<LiveMatchPage lifecycleStatus="new-match-loading" gameflowPhase="ChampSelect" />);
    expect(screen.getByText('新对局加载中')).toBeVisible();
  });

  it('renders validated team 200 as our top team and uses neutral labels without orientation', () => {
    const team200 = { ...fixtureLiveMatch, localTeamId: 200 };
    const { rerender } = render(<LiveMatchPage match={team200} />);
    expect(screen.getByRole('group', { name: '我方队伍' })).toHaveClass('team-panel--ally');
    expect(screen.getByRole('group', { name: '敌方队伍' })).toHaveClass('team-panel--enemy');
    expect(within(screen.getByRole('group', { name: '我方队伍' })).getByText('Player 5')).toBeVisible();
    rerender(<LiveMatchPage match={{ ...fixtureLiveMatch, localTeamId: null }} />);
    expect(screen.queryByRole('group', { name: '我方队伍' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '队伍 1' })).toBeVisible();
    expect(screen.getByRole('status', { name: '阵营方向无法确认' })).toHaveTextContent('?');
  });
  it('renders two stacked five-player rows and every scrollable recent match', () => {
    render(<LiveMatchPage match={fixtureLiveMatch} />);

    expect(screen.getAllByTestId('player-card')).toHaveLength(10);
    expect(screen.getAllByTestId('recent-match')).toHaveLength(100);
    expect(screen.getAllByLabelText(/KDA 8\/3\/4$/)).toHaveLength(10);
    const historyLists = screen.getAllByRole('list', { name: /最近排位对局/ });
    expect(historyLists).toHaveLength(10);
    expect(historyLists.every((list) => list.tabIndex === 0)).toBe(true);
    const css = readFileSync(resolve('src/renderer/src/features/live/live-match.css'), 'utf8');
    expect(css).toMatch(/\.live-match-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
    expect(css).toMatch(/\.team-row\s*\{[^}]*grid-template-columns:\s*repeat\(5,/s);
    expect(css).toMatch(/\.player-card__matches\s*\{[^}]*max-height:\s*177px;[^}]*overflow-y:\s*auto;/s);
    expect(css).toMatch(/\.recent-match\s*\{[^}]*height:\s*33px;/s);

    const teams = screen.getAllByRole('group', { name: /方队伍/ });
    expect(teams).toHaveLength(2);
    expect(within(teams[0]).getAllByTestId('player-card').map((card) => card.dataset.lane)).toEqual(lanes);
    expect(within(teams[1]).getAllByTestId('player-card').map((card) => card.dataset.lane)).toEqual(lanes);
    expect(document.querySelectorAll('.player-card__lane img')).toHaveLength(10);
  });

  it('expresses wins and losses through accessible icon tiles and champion image alternatives', () => {
    render(<LiveMatchPage match={fixtureLiveMatch} />);

    expect(screen.getAllByLabelText(/^胜利 ·/)).toHaveLength(50);
    expect(screen.getAllByLabelText(/^失败 ·/)).toHaveLength(50);
    expect(screen.queryByText('胜')).not.toBeInTheDocument();
    expect(screen.queryByText('负')).not.toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: /^英雄 \d+$/ })).toHaveLength(100);
    const recentChampion = screen.getAllByRole('img', { name: /^英雄 \d+$/ })[0];
    expect(recentChampion).toHaveAttribute('src', 'lol-asset://champion-icons/1.png');
    expect(recentChampion).not.toHaveAttribute('src', expect.stringContaining('/latest/'));
    fireEvent.error(recentChampion);
    expect(screen.getByRole('img', { name: '英雄 1图标不可用' })).toHaveTextContent('1');
  });

  it('shows champion selection instead of a broken image for championId zero', () => {
    const selecting: LiveMatch = {
      ...fixtureLiveMatch,
      players: fixtureLiveMatch.players.map((entry, index) => index === 0 ? { ...entry, championId: 0 } : entry)
    };
    render(<LiveMatchPage match={selecting} />);
    const fallback = screen.getByRole('img', { name: '英雄选择中' });
    expect(fallback).toHaveTextContent('');
    expect(fallback.querySelector('.player-card__champion-spinner')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '当前英雄 0' })).not.toBeInTheDocument();
  });
  it('shows a styled fallback instead of broken current champion alt text', () => {
    render(<LiveMatchPage match={fixtureLiveMatch} />);
    fireEvent.error(screen.getByRole('img', { name: '当前英雄 1' }));
    expect(screen.getByRole('img', { name: '当前英雄 1图标不可用' })).toHaveTextContent('1');
    expect(screen.queryByRole('img', { name: '当前英雄 1' })).not.toBeInTheDocument();
  });
  it('loads local client champion images even without an external asset version', () => {
    const withoutVersion: LiveMatch = { ...fixtureLiveMatch, players: fixtureLiveMatch.players.map((entry) => ({ ...entry, assetVersion: undefined })) };
    render(<LiveMatchPage match={withoutVersion} />);
    expect(screen.getAllByRole('img', { name: /^英雄 \d+$/ })).toHaveLength(100);
    expect(screen.getAllByRole('img', { name: /^英雄 \d+$/ })[0]).toHaveAttribute(
      'src', 'lol-asset://champion-icons/1.png'
    );
  });

  it('shows loading, unavailable, and fewer-than-ten states explicitly', () => {
    const partial = matches(2, 3);
    const stateMatch: LiveMatch = {
      ...fixtureLiveMatch,
      players: fixtureLiveMatch.players.map((entry, index) => {
        if (index === 0) return player(index, { status: 'loading', matches: [], sampleSize: 0 });
        if (index === 1) return player(index, { status: 'unavailable', matches: [], sampleSize: 0, errorCode: 'PRIVACY_RESTRICTED', error: '暂时无法读取' });
        if (index === 2) return player(index, { matches: partial, sampleSize: partial.length, wins: 2, losses: 1 });
        return entry;
      })
    };

    render(<LiveMatchPage match={stateMatch} />);

    expect(screen.getByText('正在加载战绩…')).toBeVisible();
    expect(screen.getByText('该玩家战绩受隐私保护')).toBeVisible();
    expect(screen.getByRole('group', { name: '战绩样本 3 场，胜率 67%；当前英雄 0 场，胜率 暂无' })).toBeVisible();
    expect(screen.getByRole('list', { name: 'Player 2最近排位对局' })).not.toHaveAttribute('tabindex');
  });

  it('shows overall loading progress while player histories stream in', () => {
    render(<LiveMatchPage players={fixtureLiveMatch.players.slice(0, 4)} loadingProgress={4} lifecycleStatus="loading" />);

    expect(screen.getByRole('status', { name: '阵容加载进度 4/10' })).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '4');
    expect(document.querySelectorAll('.live-match-page__loading-slots > span')).toHaveLength(10);
    expect(document.querySelectorAll('.live-match-page__loading-slots > .is-loaded')).toHaveLength(4);
  });

  it('calculates selected-champion stats from the full recent-20 sample while listing ten', () => {
    const twenty = matches(0, 20).map((entry, index) => index === 19 ? { ...entry, championId: 1, win: true } : entry);
    render(<LiveMatchPage match={{
      ...fixtureLiveMatch,
      players: fixtureLiveMatch.players.map((entry, index) => index === 0 ? { ...entry, matches: twenty, sampleSize: 20 } : entry)
    }} />);

    const firstCard = screen.getAllByTestId('player-card')[0];
    expect(within(firstCard).getByRole('group', { name: '战绩样本 20 场，胜率 55%；当前英雄 2 场，胜率 100%' })).toBeVisible();
    expect(within(firstCard).getAllByTestId('recent-match')).toHaveLength(10);
  });

  it('defaults to ranked history in solo and flex queues', () => {
    const { rerender } = render(<LiveMatchPage match={fixtureLiveMatch} />);
    expect(document.querySelector('.live-match-page__mode')).toHaveTextContent('单双排');
    expect(screen.getByRole('button', { name: '排位对局' })).toHaveAttribute('aria-pressed', 'true');

    rerender(<LiveMatchPage match={{ ...fixtureLiveMatch, queueId: 440, modeName: '灵活排位' }} />);
    expect(screen.getByRole('button', { name: '排位对局' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('defaults to all history outside ranked queues and filters both ranked queue types', () => {
    const mixedPlayers = fixtureLiveMatch.players.map((entry) => ({
      ...entry,
      matches: entry.matches.map((recent, index) => ({
        ...recent,
        queueId: [420, 440, 430, 450][index % 4]
      }))
    }));
    render(<LiveMatchPage match={{ ...fixtureLiveMatch, players: mixedPlayers, queueId: 450, modeName: '极地大乱斗' }} />);

    expect(screen.getByRole('button', { name: '全部对局' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByTestId('recent-match')).toHaveLength(100);
    fireEvent.click(screen.getByRole('button', { name: '排位对局' }));
    expect(screen.getByRole('button', { name: '排位对局' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByTestId('recent-match')).toHaveLength(60);
    expect(screen.getAllByLabelText(/· 单双排 ·/)).toHaveLength(30);
    expect(screen.getAllByLabelText(/· 灵活排位 ·/)).toHaveLength(30);
    expect(screen.getAllByRole('group', { name: /战绩样本 6 场/ })).toHaveLength(10);
  });

  it('renders exactly five deterministic slots per team for duplicate and unknown lanes', () => {
    const uncertain: LiveMatch = {
      ...fixtureLiveMatch,
      players: fixtureLiveMatch.players.map((entry, index) => index === 1 || index === 6 ? { ...entry, lane: 'TOP' } : index === 2 || index === 7 ? { ...entry, lane: 'UNKNOWN' } : entry),
      localTeamId: 100
    };
    render(<LiveMatchPage match={uncertain} />);

    const teams = screen.getAllByRole('group', { name: /方队伍/ });
    expect(within(teams[0]).getAllByTestId('player-card')).toHaveLength(5);
    expect(within(teams[1]).getAllByTestId('player-card')).toHaveLength(5);
    expect(screen.getAllByRole('img', { name: '位置待确认' })).toHaveLength(6);
    expect(new Set(screen.getAllByTestId('player-card').map((card) => card.getAttribute('aria-labelledby'))).size).toBe(10);
  });

  it('keeps client roster order and uses neutral lineup labels when positions are unreliable', () => {
    const scrambled = [
      player(3, { lane: 'BOTTOM' }),
      player(0, { lane: 'TOP' }),
      player(4, { lane: 'UTILITY' }),
      player(1, { lane: 'JUNGLE' }),
      player(2, { lane: 'MIDDLE' })
    ];

    expect(teamSlots(scrambled, false).map((slot) => slot.player?.playerId))
      .toEqual(scrambled.map((entry) => entry.playerId));
    expect(teamSlots(scrambled, true).map((slot) => slot.player?.playerId))
      .toEqual(['0', '1', '2', '3', '4']);
    expect(teamSlots(scrambled, false).map((slot) => slot.label))
      .toEqual(['阵容 1', '阵容 2', '阵容 3', '阵容 4', '阵容 5']);

    render(<LiveMatchPage match={{
      ...fixtureLiveMatch,
      positionOrderReliable: false,
      players: [...scrambled, ...fixtureLiveMatch.players.slice(5)]
    }} />);
    const ourTeam = screen.getByRole('group', { name: '我方队伍' });
    expect(within(ourTeam).getAllByTestId('player-card').map((card) => card.getAttribute('aria-labelledby')))
      .toEqual(scrambled.map((entry) => `player-${entry.playerId}`));
    for (const label of ['阵容 1', '阵容 2', '阵容 3', '阵容 4', '阵容 5']) {
      expect(within(ourTeam).getByLabelText(label)).toBeVisible();
    }
    expect(ourTeam.querySelectorAll('.player-card__lane img')).toHaveLength(0);
    expect(screen.queryByRole('img', { name: '位置待确认' })).not.toBeInTheDocument();
  });

  it('uses neutral roster order while progressive players arrive before match metadata', () => {
    const scrambled = [player(3), player(0), player(4), player(1), player(2)];

    render(<LiveMatchPage players={scrambled} />);

    const team = screen.getByRole('group', { name: '队伍 1' });
    expect(within(team).getAllByTestId('player-card').map((card) => card.getAttribute('aria-labelledby')))
      .toEqual(scrambled.map((entry) => `player-${entry.playerId}`));
    expect(['阵容 1', '阵容 2', '阵容 3', '阵容 4', '阵容 5'].map((label) =>
      within(team).getByLabelText(label).textContent
    )).toEqual(['1', '2', '3', '4', '5']);
  });

  it('keeps a 1050px grid inside a horizontal scroll container', () => {
    render(<LiveMatchPage match={fixtureLiveMatch} />);
    expect(screen.getByLabelText('双方对局比较')).toHaveClass('live-match-page__scroll');
    const css = readFileSync(resolve('src/renderer/src/features/live/live-match.css'), 'utf8');
    expect(css).toMatch(/\.live-match-page__scroll\s*\{[^}]*overflow-x:\s*auto;/s);
    expect(css).toMatch(/\.live-match-grid\s*\{[^}]*min-width:\s*1050px;/s);
  });

  it('keeps both five-player rosters useful when every history is private', () => {
    render(<LiveMatchPage match={{
      ...fixtureLiveMatch,
      players: fixtureLiveMatch.players.map((entry) => ({ ...entry, status: 'unavailable', errorCode: 'PRIVACY_RESTRICTED', matches: [], sampleSize: 0 }))
    }} />);

    expect(screen.getAllByTestId('team-roster')).toHaveLength(2);
    expect(screen.getAllByTestId('player-card')).toHaveLength(10);
    expect(screen.getAllByText('该玩家战绩受隐私保护')).toHaveLength(10);
    expect(screen.getAllByRole('img', { name: /当前英雄 \d+/ })).toHaveLength(10);
  });
});

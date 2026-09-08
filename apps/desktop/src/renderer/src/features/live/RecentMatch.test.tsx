import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RecentMatch from './RecentMatch';

const match = { matchId: '1', queueId: 420, endedAt: 1, durationSeconds: 1800, championId: 1, win: true, kills: 13, deaths: 5, assists: 11 };

describe('live history detail row', () => {
  it.each([[420, '单双排'], [440, '灵活排位'], [430, '匹配模式'], [450, '极地大乱斗']] as const)('shows queue %s even when honors are present', (queueId, label) => {
    render(<ol><RecentMatch match={{ ...match, queueId, mvp: true, multiKill: 3 }} /></ol>);
    expect(screen.getByText(label)).toBeVisible();
  });
  it('collapses unavailable loadout and honors instead of guessing from kills', () => {
    const { container } = render(<ol><RecentMatch match={match} /></ol>);
    expect(screen.queryByText('MVP')).not.toBeInTheDocument();
    expect(container.querySelector('.recent-match__badges')).toBeNull();
    expect(container.querySelector('.recent-match__spells')).toBeNull();
    expect(container.querySelector('.recent-match__items')).toBeNull();
  });

  it('shows supplied honors, spells and only equipment with resolved icons', () => {
    render(<ol><RecentMatch match={{ ...match, mvp: true, multiKill: 3, summonerSpellIds: [4, 12], itemIds: [3071, 3053] }} itemIconPaths={{ 3071: '/lol-game-data/assets/ASSETS/Items/Icons2D/3071.png' }} /></ol>);
    expect(screen.getByText('MVP')).toBeVisible();
    expect(screen.getByText('三杀')).toBeVisible();
    expect(screen.getByRole('img', { name: '召唤师技能 4' })).toBeVisible();
    expect(screen.getByRole('img', { name: '装备 3071' })).toBeVisible();
    expect(screen.queryByRole('img', { name: '装备 3053' })).not.toBeInTheDocument();
  });
});

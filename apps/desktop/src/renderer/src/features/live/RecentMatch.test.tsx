import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RecentMatch from './RecentMatch';

const match = { matchId: '1', queueId: 420, endedAt: 1, durationSeconds: 1800, championId: 1, win: true, kills: 13, deaths: 5, assists: 11 };

describe('live history detail row', () => {
  it.each([true, false])('only shows carry above KDA and keeps queue below (compact=%s)', (compact) => {
    const { rerender, container } = render(<ol><RecentMatch compact={compact} match={{ ...match, killParticipation: .6, teamDamageShare: .35, teamDamageTakenShare: .25 }} /></ol>);
    expect(screen.getByText('CARRY')).toBeVisible();
    const performance = container.querySelector('.recent-match__performance')!;
    expect([...performance.children].map(node => node.className)).toEqual(['recent-match__honors', 'recent-match__kda', 'recent-match__mode']);
    expect(screen.getByText('单双排')).toBeVisible();
    rerender(<ol><RecentMatch compact={compact} match={{ ...match, kills: 1, assists: 2, deaths: 10, killParticipation: .2 }} /></ol>);
    expect(container.querySelector('.recent-match__form')).toBeNull();
    for (const data of [{ ...match, killParticipation: .4 }, { ...match, queueId: 450, killParticipation: .6 }, match, { ...match, remake: true, killParticipation: .6 }]) {
      rerender(<ol><RecentMatch compact={compact} match={data} /></ol>);
      expect(container.querySelector('.recent-match__form')).toBeNull();
    }
  });
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

  it('hides legacy MVP and multikills but keeps spells and resolved equipment', () => {
    render(<ol><RecentMatch match={{ ...match, mvp: true, multiKill: 3, summonerSpellIds: [4, 12], itemIds: [3071, 3053] }} itemIconPaths={{ 3071: '/lol-game-data/assets/ASSETS/Items/Icons2D/3071.png' }} /></ol>);
    expect(screen.queryByText('MVP')).toBeNull();
    expect(screen.queryByText('三杀')).toBeNull();
    expect(screen.getByRole('img', { name: '召唤师技能 4' })).toBeVisible();
    expect(screen.getByRole('img', { name: '装备 3071' })).toBeVisible();
    expect(screen.queryByRole('img', { name: '装备 3053' })).not.toBeInTheDocument();
  });
  it.each([true, false])('prioritizes custom MVP/SVP in overview and keeps both in detail (compact=%s)', compact => {
    const data = { ...match, killParticipation: .7, teamDamageShare: .35, teamDamageTakenShare: .3, multiKill: 5 as const };
    const { rerender } = render(<ol><RecentMatch compact={compact} match={{ ...data, performanceAward: 'MVP' }} /></ol>);
    expect(screen.getByText('MVP')).toHaveAttribute('title', expect.stringContaining('峡谷雷达评选'));
    if (compact) expect(screen.queryByText('CARRY')).toBeNull();
    else expect(screen.getByText('CARRY')).toBeVisible();
    expect(screen.queryByText('五杀')).toBeNull();
    rerender(<ol><RecentMatch compact={compact} match={{ ...data, win: false, performanceAward: 'SVP' }} /></ol>);
    expect(screen.getByText('SVP')).toHaveClass('is-svp');
    if (compact) expect(screen.queryByText('CARRY')).toBeNull();
    else expect(screen.getByText('CARRY')).toBeVisible();
    expect(screen.queryByText('MVP')).toBeNull();
    rerender(<ol><RecentMatch compact={compact} match={{ ...data, win: false, performanceAward: 'MVP' }} /></ol>);
    expect(screen.queryByText('MVP')).toBeNull();
    rerender(<ol><RecentMatch compact={compact} match={{ ...data, teamDamageTakenShare: undefined, performanceAward: 'MVP' }} /></ol>);
    expect(screen.queryByText('MVP')).toBeNull();
  });
});

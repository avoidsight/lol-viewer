import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChampionLibraryPage from './ChampionLibraryPage';

const guide = {
  championId: 114, lane: 'TOP' as const, patch: '16.14', source: 'CN_OFFICIAL' as const,
  region: 'CN', tier: '翡翠+', fetchedAt: '2026-07-16T00:00:00.000Z', stale: false,
  builds: [{ itemIds: [3071, 3053], pickRate: 0.42 }],
  favorable: [{ opponentChampionId: 86, winRate: 0.55, games: 120 }],
  unfavorable: [{ opponentChampionId: 24, winRate: 0.46 }], notes: ['三级前稳健换血']
};

describe('ChampionLibraryPage', () => {
  it('renders attribution, complete snapshot sections, and admin notes', async () => {
    render(<ChampionLibraryPage getGuide={vi.fn().mockResolvedValue(guide)} />);
    expect(await screen.findByText('国服官方')).toBeVisible();
    expect(screen.getByText(/CN · 翡翠\+ · 16\.14/)).toBeVisible();
    expect(screen.getByText(/3071 → 3053/)).toBeVisible();
    expect(screen.getByText(/英雄 86/)).toBeVisible();
    expect(screen.getByText(/英雄 24/)).toBeVisible();
    expect(screen.getByText('三级前稳健换血')).toBeVisible();
  });

  it('marks an offline snapshot stale', async () => {
    render(<ChampionLibraryPage getGuide={vi.fn().mockResolvedValue({ ...guide, stale: true })} />);
    expect(await screen.findByText('离线缓存')).toBeVisible();
  });

  it('shows explicit unavailable state without recommendations', async () => {
    render(<ChampionLibraryPage getGuide={vi.fn().mockRejectedValue(new Error('offline'))} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('英雄数据暂不可用');
    expect(screen.queryByRole('heading', { name: '推荐出装' })).not.toBeInTheDocument();
  });
});

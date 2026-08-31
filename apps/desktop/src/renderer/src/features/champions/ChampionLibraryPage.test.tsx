import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChampionLibraryPage from './ChampionLibraryPage';
import type { ChampionCatalogEntry, ChampionDetails, ChampionGuide } from '../../../../shared/ipc';

const catalog: ChampionCatalogEntry[] = [
  { id: 145, name: '虚空之女', title: '卡莎', alias: 'Kaisa', roles: ['marksman'] },
  { id: 114, name: '无双剑姬', title: '菲奥娜', alias: 'Fiora', roles: ['fighter'] }
];
const details: ChampionDetails = {
  ...catalog[0], shortBio: '在虚空中生存归来的猎手。', abilities: [
    { key: 'P', name: '体表活肤', description: '叠加电浆。', iconPath: '/p.png' },
    { key: 'Q', name: '艾卡西亚暴雨', description: '发射弹体。', iconPath: '/q.png' },
    { key: 'W', name: '虚空索敌', description: '远程攻击。', iconPath: '/w.png' },
    { key: 'E', name: '极限超载', description: '提升攻速。', iconPath: '/e.png' },
    { key: 'R', name: '猎手本能', description: '突进并获得护盾。', iconPath: '/r.png' }
  ]
};
const guide: ChampionGuide = {
  championId: 145, lane: 'BOTTOM', patch: '16.14', source: 'OPGG', region: 'GLOBAL', tier: '翡翠+',
  fetchedAt: '2026-08-03T00:00:00.000Z', stale: false,
  summonerSpellIds: [4, 7], starterItemIds: [1055, 2003], bootsItemIds: [3006],
  skillOrders: [{ keys: ['Q','W','E','Q','Q','R','Q','E','Q','E','R','E','E','W','W','R','W','W'], pickRate: 0.52 }],
  builds: [{ itemIds: [6672, 3006, 3124], pickRate: 0.39 }], favorable: [], unfavorable: [], notes: []
};

function renderPage(overrides: Partial<React.ComponentProps<typeof ChampionLibraryPage>> = {}) {
  const props = {
    getCatalog: vi.fn().mockResolvedValue(catalog),
    getDetails: vi.fn().mockResolvedValue(details),
    getGuide: vi.fn().mockResolvedValue(guide),
    ...overrides
  };
  render(<ChampionLibraryPage {...props} />);
  return props;
}

describe('ChampionLibraryPage MVP', () => {
  it('searches champions and renders the selected hero guide', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: /卡莎/ })).toBeVisible();
    expect(await screen.findByRole('heading', { name: '技能加点' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '推荐出装' })).toBeVisible();
    expect(screen.getByText('52.0%')).toBeVisible();
    expect(screen.getByText('39.0%')).toBeVisible();
    expect(screen.getByText('艾卡西亚暴雨')).toBeVisible();

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索英雄' }), { target: { value: '菲奥娜' } });
    expect(screen.getByRole('button', { name: /菲奥娜/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /卡莎/ })).not.toBeInTheDocument();
  });

  it('shows QWER ability icons and marks the level where each ability reaches full rank', async () => {
    renderPage();
    await screen.findByText('52.0%');

    const priorityIcons = [...document.querySelectorAll<HTMLImageElement>('.champion-library__skill-overview img')];
    expect(priorityIcons.map((icon) => icon.alt)).toEqual(['Q skill', 'E skill', 'W skill']);
    expect([...document.querySelectorAll('.champion-library__skill-overview small')].map((badge) => badge.textContent)).toEqual(['9', '13', '18']);
    const steps = [...document.querySelectorAll<HTMLElement>('.champion-library__skill-step')];
    expect(steps).toHaveLength(18);
    expect(steps.every((step) => step.querySelector('small') === null)).toBe(true);
    expect(steps.map((step) => step.querySelector('b')?.textContent)).toEqual(guide.skillOrders![0].keys);
    expect(steps.every((step) => step.classList.contains(`champion-library__skill-step--${step.querySelector('b')?.textContent?.toLowerCase()}`))).toBe(true);
    expect(steps.filter((step) => step.classList.contains('is-maxed')).map((step) => step.title)).toEqual([
      'Q maxed at level 9', 'E maxed at level 13', 'R maxed at level 16', 'W maxed at level 18'
    ]);
  });
  it('reloads recommendations when the lane changes without reloading champion details', async () => {
    const props = renderPage();
    await screen.findByRole('heading', { name: /卡莎/ });
    fireEvent.click(screen.getByRole('button', { name: '中路' }));
    await waitFor(() => expect(props.getGuide).toHaveBeenLastCalledWith(145, 'MIDDLE'));
    expect(props.getDetails).toHaveBeenCalledTimes(1);
  });

  it('keeps local champion skills visible when recommendation service is unavailable', async () => {
    renderPage({ getGuide: vi.fn().mockRejectedValue(new Error('offline')) });
    expect(await screen.findByText('艾卡西亚暴雨')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('攻略数据暂不可用');
  });
});
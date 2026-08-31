import { describe, expect, it, vi } from 'vitest';
import type { LcuClient } from '../lcu/http-client';
import { ChampionCatalogService } from './champion-catalog-service';

describe('ChampionCatalogService', () => {
  it('loads and sanitizes the complete visible champion catalog', async () => {
    const get = vi.fn().mockResolvedValue([
      { id: -1, name: '无', description: '', alias: 'None', roles: [] },
      { id: 60001, name: '黑暗之女', description: '安妮', alias: 'Jade_Annie', roles: ['mage'] },
      { id: 145, name: '虚空之女', description: '卡莎', alias: 'Kaisa', roles: ['marksman'] }
    ]);
    const service = new ChampionCatalogService({ get } as unknown as LcuClient);

    await expect(service.getCatalog()).resolves.toEqual([
      { id: 145, name: '虚空之女', title: '卡莎', alias: 'Kaisa', roles: ['marksman'] }
    ]);
  });

  it('resolves requested item ids to local client icon paths', async () => {
    const get = vi.fn().mockResolvedValue([
      { id: 6672, iconPath: '/lol-game-data/assets/ASSETS/Items/Icons2D/6672.png' },
      { id: 3006, iconPath: '/lol-game-data/assets/ASSETS/Items/Icons2D/3006.png' }
    ]);
    const service = new ChampionCatalogService({ get } as unknown as LcuClient);

    await expect(service.getItemIconPaths([6672])).resolves.toEqual({
      6672: '/lol-game-data/assets/ASSETS/Items/Icons2D/6672.png'
    });
  });
  it('loads passive and QWER details for the selected champion', async () => {
    const get = vi.fn().mockResolvedValue({
      id: 145, name: '虚空之女', title: '卡莎', alias: 'Kaisa', shortBio: '虚空猎手', roles: ['marksman'],
      passive: { name: '体表活肤', abilityIconPath: '/passive.png', description: '叠加电浆。' },
      spells: [
        { spellKey: 'q', name: '艾卡西亚暴雨', abilityIconPath: '/q.png', description: '发射弹体。' },
        { spellKey: 'w', name: '虚空索敌', abilityIconPath: '/w.png', description: '远程攻击。' },
        { spellKey: 'e', name: '极限超载', abilityIconPath: '/e.png', description: '提升攻速。' },
        { spellKey: 'r', name: '猎手本能', abilityIconPath: '/r.png', description: '突进并获得护盾。' }
      ]
    });
    const service = new ChampionCatalogService({ get } as unknown as LcuClient);

    const details = await service.getDetails(145);

    expect(details.abilities.map((ability) => ability.key)).toEqual(['P', 'Q', 'W', 'E', 'R']);
    expect(details.abilities[1]).toMatchObject({ name: '艾卡西亚暴雨', iconPath: '/q.png' });
  });
});
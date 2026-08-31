import { z } from 'zod';
import {
  championCatalogSchema, championDetailsSchema,
  type ChampionCatalogEntry, type ChampionDetails
} from '../../shared/ipc';
import type { LcuClient } from '../lcu/http-client';

const rawCatalogSchema = z.array(z.object({
  id: z.number().int(), name: z.string(), description: z.string(), alias: z.string(),
  roles: z.array(z.string()).default([])
}).passthrough());
const rawAbilitySchema = z.object({
  name: z.string(), abilityIconPath: z.string(), description: z.string().default('')
}).passthrough();
const rawItemsSchema = z.array(z.object({ id: z.number().int().positive(), iconPath: z.string().min(1) }).passthrough());
const rawDetailsSchema = z.object({
  id: z.number().int().positive(), name: z.string(), title: z.string(), alias: z.string(),
  shortBio: z.string().default(''), roles: z.array(z.string()).default([]),
  passive: rawAbilitySchema,
  spells: z.array(rawAbilitySchema.extend({ spellKey: z.string() })).min(4)
}).passthrough();

export class ChampionCatalogService {
  private catalog?: ChampionCatalogEntry[];
  private readonly details = new Map<number, ChampionDetails>();
  private itemIconPaths?: Record<string, string>;
  constructor(private readonly client: LcuClient) {}

  async getCatalog(): Promise<ChampionCatalogEntry[]> {
    if (this.catalog) return this.catalog;
    const raw = rawCatalogSchema.parse(await this.client.get('/lol-game-data/assets/v1/champion-summary.json', rawCatalogSchema));
    this.catalog = championCatalogSchema.parse(raw.filter((entry) => entry.id > 0 && entry.id < 1_000).map((entry) => ({
      id: entry.id, name: entry.name, title: entry.description || entry.name, alias: entry.alias, roles: entry.roles
    })));
    return this.catalog;
  }

  async getItemIconPaths(itemIds: number[]): Promise<Record<string, string>> {
    if (!this.itemIconPaths) {
      const items = rawItemsSchema.parse(await this.client.get('/lol-game-data/assets/v1/items.json', rawItemsSchema));
      this.itemIconPaths = Object.fromEntries(items
        .filter((item) => item.iconPath.startsWith('/lol-game-data/assets/') && !item.iconPath.includes('..'))
        .map((item) => [String(item.id), item.iconPath]));
    }
    return Object.fromEntries(itemIds
      .map((id) => [String(id), this.itemIconPaths?.[String(id)]])
      .filter((entry): entry is [string, string] => Boolean(entry[1])));
  }
  async getDetails(championId: number): Promise<ChampionDetails> {
    const cached = this.details.get(championId);
    if (cached) return cached;
    const raw = rawDetailsSchema.parse(await this.client.get(`/lol-game-data/assets/v1/champions/${championId}.json`, rawDetailsSchema));
    const abilities = [
      { key: 'P' as const, name: raw.passive.name, description: raw.passive.description, iconPath: raw.passive.abilityIconPath },
      ...raw.spells.filter((spell) => ['q', 'w', 'e', 'r'].includes(spell.spellKey.toLowerCase())).map((spell) => ({
        key: spell.spellKey.toUpperCase() as 'Q' | 'W' | 'E' | 'R', name: spell.name,
        description: spell.description, iconPath: spell.abilityIconPath
      }))
    ];
    const value = championDetailsSchema.parse({
      id: raw.id, name: raw.name, title: raw.title, alias: raw.alias,
      shortBio: raw.shortBio, roles: raw.roles, abilities
    });
    this.details.set(championId, value);
    return value;
  }
}
import { z } from 'zod';
import type { LcuClient } from './http-client';

const assetVersionSchema = z.string().regex(/^\d+\.\d+(?:\.\d+){0,2}$/);
const championsSchema = z.array(z.object({ id: z.number().int(), name: z.string().min(1).max(100) }));
export type ChampionMetadata = Record<number, { name: string }>;
const itemMetadataSchema = z.array(z.object({
  id: z.number().int().positive(),
  iconPath: z.string().min(1)
}).passthrough());

export interface LcuStaticDataProvider {
  getChampionMetadata?(client: LcuClient): Promise<ChampionMetadata>;
  getAssetVersion(client: LcuClient): Promise<string>;
  getItemIconPaths(client: LcuClient): Promise<Record<string, string>>;
}

export class LcuStaticDataCache implements LcuStaticDataProvider {
  private champions?: Promise<ChampionMetadata>;
  private championsRetryAt = 0;
  getChampionMetadata(client: LcuClient): Promise<ChampionMetadata> {
    if (this.champions) return this.champions;
    if (Date.now() < this.championsRetryAt) return Promise.resolve({});
    this.champions = client.get('/lol-game-data/assets/v1/champion-summary.json', championsSchema)
      .then(value => Object.fromEntries(championsSchema.parse(value).filter(c => c.id > 0).map(c => [c.id, { name: c.name }])))
      .catch(() => { this.champions = undefined; this.championsRetryAt = Date.now() + 60_000; return {}; });
    return this.champions;
  }
  private assetVersion: Promise<string> | undefined;
  private itemIconPaths: Promise<Record<string, string>> | undefined;

  getAssetVersion(client: LcuClient): Promise<string> {
    if (this.assetVersion) return this.assetVersion;
    const request = client.get('/lol-patch/v1/game-version', assetVersionSchema)
      .then((value) => assetVersionSchema.parse(value))
      .catch((error) => {
        if (this.assetVersion === request) this.assetVersion = undefined;
        throw error;
      });
    this.assetVersion = request;
    return request;
  }

  getItemIconPaths(client: LcuClient): Promise<Record<string, string>> {
    if (this.itemIconPaths) return this.itemIconPaths;
    const request = client.get('/lol-game-data/assets/v1/items.json', itemMetadataSchema)
      .then((value) => itemMetadataSchema.parse(value))
      .then((items) => Object.fromEntries(items
        .filter((item) =>
          item.iconPath.startsWith('/lol-game-data/assets/') && !item.iconPath.includes('..'))
        .map((item) => [String(item.id), item.iconPath])))
      .catch((error) => {
        if (this.itemIconPaths === request) this.itemIconPaths = undefined;
        throw error;
      });
    this.itemIconPaths = request;
    return request;
  }
}

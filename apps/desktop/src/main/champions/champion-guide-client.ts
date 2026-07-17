import { championGuideSnapshotSchema, type ChampionGuide, type ChampionLane } from '../../shared/ipc';
import type { ChampionGuideCache } from '../cache/database';

interface Options { baseUrl: string; patch: string; cache: Pick<ChampionGuideCache, 'get' | 'put'>; fetch?: typeof fetch }

export class ChampionGuideClient {
  private readonly fetcher: typeof fetch;
  constructor(private readonly options: Options) { this.fetcher = options.fetch ?? fetch; }
  async getChampionGuide(championId: number, lane: ChampionLane): Promise<ChampionGuide> {
    try {
      const url = `${this.options.baseUrl.replace(/\/$/, '')}/v1/patches/${encodeURIComponent(this.options.patch)}/champions/${championId}?lane=${lane}`;
      const response = await this.fetcher(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`Guide service returned ${response.status}`);
      const snapshot = championGuideSnapshotSchema.parse(await response.json());
      if (snapshot.patch !== this.options.patch || snapshot.championId !== championId || snapshot.lane !== lane) throw new Error('Guide identity mismatch');
      this.options.cache.put(snapshot);
      return { ...snapshot, stale: false };
    } catch {
      const cached = this.options.cache.get(this.options.patch, championId, lane);
      if (cached) return { ...cached, stale: true };
      throw new Error('Champion guide unavailable');
    }
  }
}

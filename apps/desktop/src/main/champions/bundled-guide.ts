import {
  championGuideSnapshotSchema,
  type ChampionGuideSnapshot,
  type ChampionLane
} from '../../shared/ipc';

const snapshots = new Map<string, ChampionGuideSnapshot>();

const fioraTop = championGuideSnapshotSchema.parse({
  championId: 114,
  lane: 'TOP',
  patch: '16.14',
  source: 'MANUAL',
  region: 'CN',
  tier: '离线MVP',
  fetchedAt: '2026-07-19T00:00:00.000Z',
  builds: [{ itemIds: [3071, 3053, 6333] }],
  favorable: [],
  unfavorable: [],
  notes: ['随包离线出装，仅用于网络数据不可用时展示；不代表实时胜率。']
});

snapshots.set(`${fioraTop.championId}:${fioraTop.lane}`, fioraTop);

export function getBundledGuide(
  championId: number,
  lane: ChampionLane
): ChampionGuideSnapshot | null {
  return snapshots.get(`${championId}:${lane}`) ?? null;
}

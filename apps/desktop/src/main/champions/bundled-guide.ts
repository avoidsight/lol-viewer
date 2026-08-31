import { championGuideSnapshotSchema, type ChampionGuideSnapshot, type ChampionLane } from '../../shared/ipc';

const snapshots = new Map<string, ChampionGuideSnapshot>();
const add = (value: ChampionGuideSnapshot) => snapshots.set(`${value.championId}:${value.lane}`, championGuideSnapshotSchema.parse(value));

add({
  championId: 145, lane: 'BOTTOM', patch: '16.14', source: 'MANUAL', region: 'GLOBAL', tier: '翡翠+',
  fetchedAt: '2026-08-03T00:00:00.000Z', summonerSpellIds: [4, 7], starterItemIds: [1055, 2003], bootsItemIds: [3006],
  skillOrders: [{ keys: ['Q','W','E','Q','Q','R','Q','E','Q','E','R','E','E','W','W','R','W','W'], pickRate: 0.5192 }],
  builds: [
    { itemIds: [6672, 3006, 3124], pickRate: 0.3921 },
    { itemIds: [6672, 3006, 3115], pickRate: 0.1237 },
    { itemIds: [6672, 3006, 3085], pickRate: 0.1026 }
  ], favorable: [], unfavorable: [], notes: ['离线内置推荐；联网后会自动使用服务器的当前版本数据。']
});
add({
  championId: 114, lane: 'TOP', patch: '16.14', source: 'MANUAL', region: 'GLOBAL', tier: '翡翠+',
  fetchedAt: '2026-08-03T00:00:00.000Z', summonerSpellIds: [4, 12], starterItemIds: [1054, 2003], bootsItemIds: [3047, 3111],
  skillOrders: [{ keys: ['Q','W','E','Q','Q','R','Q','E','Q','E','R','E','E','W','W','R','W','W'] }],
  builds: [{ itemIds: [3071, 3053, 6333] }, { itemIds: [3071, 3074, 3053] }],
  favorable: [], unfavorable: [], notes: ['离线内置推荐；联网后会自动使用服务器的当前版本数据。']
});

export function getBundledGuide(championId: number, lane: ChampionLane): ChampionGuideSnapshot | null {
  return snapshots.get(`${championId}:${lane}`) ?? null;
}
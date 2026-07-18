# Three-Tab Match Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a three-tab desktop experience with a default personal 20-match history page, on-demand all-mode live matchup comparison, and the existing champion library.

**Architecture:** Add a personal-history domain and IPC path beside the existing live-match path, while sharing the LCU client, match-history adapter, and SQLite database. An `AppShell` owns the fixed navigation; each page owns its request lifecycle, and live-match generation cancellation prevents stale results after tab changes.

**Tech Stack:** Electron 37, TypeScript 5.8, React 19, Zod 3, better-sqlite3, Vitest, Testing Library, Playwright, electron-vite, pnpm 10.

## Global Constraints

- Windows desktop and Chinese UI remain the supported product surface.
- The default Tab is `战绩`; it loads the current summoner's latest 20 matches across all modes.
- `对战信息` starts LCU gameflow detection only while active and cancels it when inactive.
- Live comparison accepts ranked, normal, ARAM, and other complete ten-player sessions.
- Summoner's Rift uses `TOP / JUNGLE / MIDDLE / BOTTOM / UTILITY`; ARAM or unreliable positions use client roster order.
- Each live player displays the latest 10 matches across all modes; rank is optional.
- Renderer code never accesses LCU directly; every IPC request and response is validated with strict Zod schemas.
- LCU credentials, lockfile paths, ports, and raw response bodies must never cross IPC.
- No composite match rating, cloud account, or third-party live-data fallback is added.

---

## File Structure

- Create `apps/desktop/src/main/history/personal-history-service.ts`: load current summoner, 20 matches, rank, aggregate statistics, and cache fallback.
- Create `apps/desktop/src/main/history/personal-history-service.test.ts`: service success, partial data, cache, and sanitized failure tests.
- Create `apps/desktop/src/main/ipc/register-history-ipc.ts`: authorized personal-history IPC handler.
- Create `apps/desktop/src/main/ipc/register-history-ipc.test.ts`: IPC validation and authorization tests.
- Create `apps/desktop/src/renderer/src/AppShell.tsx`: fixed three-tab accessible navigation.
- Create `apps/desktop/src/renderer/src/AppShell.test.tsx`: navigation behavior tests.
- Create `apps/desktop/src/renderer/src/features/history/PersonalHistoryPage.tsx`: summary, favorite champions, and 20-match list.
- Create `apps/desktop/src/renderer/src/features/history/PersonalHistoryPage.test.tsx`: personal-history rendering and states.
- Create `apps/desktop/src/renderer/src/features/history/personal-history.css`: focused history-page layout.
- Modify `apps/desktop/src/shared/domain.ts`: queue mode labels, personal snapshot, favorite champion, and cache metadata types.
- Modify `apps/desktop/src/shared/ipc.ts`: personal-history channels/schemas and live session mode metadata.
- Modify `apps/desktop/src/main/lcu/match-adapter.ts`: parameterized history limit and queue-name helper.
- Modify `apps/desktop/src/main/lcu/match-adapter.test.ts`: 10/20 limits and mode labeling.
- Modify `apps/desktop/src/main/cache/database.ts`: migration 3 and personal-history cache.
- Modify `apps/desktop/src/main/cache/database.test.ts`: cache validation, TTL, and latest fallback.
- Modify `apps/desktop/src/preload/index.ts`: expose personal-history method.
- Modify `apps/desktop/src/preload/index.test.ts`: validate history bridge behavior.
- Modify `apps/desktop/src/main/index.ts`: register history service and fixture.
- Modify `apps/desktop/src/main/match/match-service.ts`: accept all-mode history and return queue/mode/position metadata.
- Modify `apps/desktop/src/main/match/match-service.test.ts`: ARAM and normal-mode sessions.
- Modify `apps/desktop/src/main/fixtures/live-match.ts`: personal fixture and ARAM-capable live fixture.
- Modify `apps/desktop/src/renderer/src/App.tsx`: page-owned loading lifecycles and cancellation.
- Modify `apps/desktop/src/renderer/src/App.test.tsx`: default history, lazy live loading, cancellation, and stale-result tests.
- Modify `apps/desktop/src/renderer/src/features/live/LiveMatchPage.tsx`: all-mode header, reliable-position and roster-order layouts, waiting page.
- Modify `apps/desktop/src/renderer/src/features/live/LiveMatchPage.test.tsx`: ordering and waiting-state tests.
- Modify `apps/desktop/src/renderer/src/features/live/RecentMatch.tsx`: optional queue-mode label.
- Modify `apps/desktop/src/renderer/src/features/live/live-match.css`: top navigation and waiting panel styling.
- Modify `apps/desktop/src/renderer/src/features/champions/ChampionLibraryPage.tsx`: remove internal back navigation.
- Modify `apps/desktop/tests/e2e/live-match.spec.ts`: verify all three Tabs, 20 personal records, and lazy 100-record live page.

---

### Task 1: Define Personal History and Live Mode Contracts

**Files:**
- Modify: `apps/desktop/src/shared/domain.ts`
- Modify: `apps/desktop/src/shared/ipc.ts`
- Test: `apps/desktop/src/shared/ipc.test.ts`

**Interfaces:**
- Produces: `QueueMode`, `FavoriteChampion`, `PersonalHistorySnapshot`, `personalHistorySchema`, `PERSONAL_HISTORY_GET_CHANNEL`.
- Extends: `LiveMatch` with `queueId`, `modeName`, and `positionOrderReliable`.

- [ ] **Step 1: Write failing schema tests**

Add strict parsing tests:

```ts
import { describe, expect, it } from 'vitest';
import { liveMatchSchema, personalHistorySchema } from './ipc';

describe('personalHistorySchema', () => {
  it('accepts exactly the validated personal snapshot and rejects unknown fields', () => {
    const value = {
      playerId: '7', displayName: 'Player', profileIconId: 29, rank: 'GOLD II 20 LP',
      matches: [], sampleSize: 0, wins: 0, losses: 0, winRate: 0, averageKda: 0,
      favoriteChampions: [], assetVersion: '16.14.1', cached: false, updatedAt: 1
    };
    expect(personalHistorySchema.parse(value)).toEqual(value);
    expect(() => personalHistorySchema.parse({ ...value, token: 'secret' })).toThrow();
  });

  it('requires live mode metadata', () => {
    expect(() => liveMatchSchema.parse({ players: [], queueId: 450 })).toThrow();
  });
});
```

- [ ] **Step 2: Run the schema test and observe RED**

Run: `pnpm --filter @lol-viewer/desktop test -- src/shared/ipc.test.ts`

Expected: FAIL because `personalHistorySchema` and required live metadata do not exist.

- [ ] **Step 3: Add the domain types and strict schemas**

Add to `domain.ts`:

```ts
export type QueueMode = 'RANKED' | 'NORMAL' | 'ARAM' | 'OTHER';

export interface FavoriteChampion {
  championId: number;
  games: number;
  wins: number;
  winRate: number;
}

export interface PersonalHistorySnapshot {
  playerId: string;
  displayName: string;
  profileIconId: number;
  rank?: string;
  matches: MatchSummary[];
  sampleSize: number;
  wins: number;
  losses: number;
  winRate: number;
  averageKda: number;
  favoriteChampions: FavoriteChampion[];
  assetVersion?: string;
  cached: boolean;
  updatedAt: number;
}
```

Export the existing `matchSummarySchema`, then add to `ipc.ts`:

```ts
export const PERSONAL_HISTORY_GET_CHANNEL = 'history:get-personal' as const;
const favoriteChampionSchema = z.object({
  championId: z.number().int().nonnegative(), games: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(), winRate: z.number().min(0).max(1)
}).strict();
export const personalHistorySchema: z.ZodType<PersonalHistorySnapshot> = z.object({
  playerId: z.string(), displayName: z.string(), profileIconId: z.number().int().nonnegative(),
  rank: z.string().optional(), matches: z.array(matchSummarySchema).max(20),
  sampleSize: z.number().int().min(0).max(20), wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(), winRate: z.number().min(0).max(1),
  averageKda: z.number().nonnegative(), favoriteChampions: z.array(favoriteChampionSchema).max(5),
  assetVersion: z.string().min(1).optional(), cached: z.boolean(), updatedAt: z.number()
}).strict();
export const liveMatchSchema = z.object({
  players: z.array(playerSnapshotSchema).length(10), localTeamId: z.number().int().nullable().optional(),
  queueId: z.number().int().nonnegative(), modeName: z.string().min(1), positionOrderReliable: z.boolean()
}).strict();
```

Update `LolViewerApi` with `getPersonalHistory(): Promise<PersonalHistorySnapshot>` and update `LiveMatch` with the three required metadata fields.

- [ ] **Step 4: Run schema tests and typecheck**

Run: `pnpm --filter @lol-viewer/desktop test -- src/shared/ipc.test.ts && pnpm --filter @lol-viewer/desktop typecheck`

Expected: PASS after fixture/type errors are updated minimally to include `queueId: 420`, `modeName: '单双排'`, and `positionOrderReliable: true`.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared/domain.ts apps/desktop/src/shared/ipc.ts apps/desktop/src/shared/ipc.test.ts apps/desktop/src/main/fixtures/live-match.ts apps/desktop/src/renderer/src/App.test.tsx
git commit -m "feat: define personal history contracts"
```

---

### Task 2: Parameterize Match History and Queue Labels

**Files:**
- Modify: `apps/desktop/src/main/lcu/match-adapter.ts`
- Modify: `apps/desktop/src/main/lcu/match-adapter.test.ts`

**Interfaces:**
- Produces: exported `matchHistoryResponseSchema`, `adaptMatchHistory(input, { scope, limit })`, and `describeQueue(queueId)`.
- Consumers: personal history service uses limit 20; live match uses limit 10.

- [ ] **Step 1: Write failing adapter tests**

```ts
it('returns twenty all-mode matches when requested', () => {
  const games = Array.from({ length: 25 }, (_, index) => ({ ...fixture.games[0], gameId: index, gameCreation: index }));
  expect(adaptMatchHistory({ games }, { scope: 'all', limit: 20 })).toHaveLength(20);
});

it.each([[420, '单双排'], [430, '匹配模式'], [450, '极地大乱斗'], [1700, '其他模式']])(
  'labels queue %i', (queueId, expected) => expect(describeQueue(queueId)).toBe(expected)
);
```

- [ ] **Step 2: Run adapter tests and observe RED**

Run: `pnpm --filter @lol-viewer/desktop test -- src/main/lcu/match-adapter.test.ts`

Expected: FAIL because the adapter still accepts a scope string and always slices to 10.

- [ ] **Step 3: Implement explicit options and queue descriptions**

```ts
interface AdaptOptions { scope: QueueScope; limit: 10 | 20 }

export const matchHistoryResponseSchema = matchHistorySchema;

export function describeQueue(queueId: number): string {
  if (queueId === 420 || queueId === 440) return '单双排';
  if (queueId === 430 || queueId === 400) return '匹配模式';
  if (queueId === 450) return '极地大乱斗';
  return '其他模式';
}

export function adaptMatchHistory(input: unknown, { scope, limit }: AdaptOptions): MatchSummary[] {
  const history = matchHistorySchema.parse(input);
  return history.games
    .filter((game) => scope === 'all' || game.queueId === 420)
    .map(mapGame)
    .sort((left, right) => right.endedAt - left.endedAt)
    .slice(0, limit);
}
```

Update existing callers to use `{ scope, limit: 10 }` without changing their behavior.

- [ ] **Step 4: Run adapter and match-service tests**

Run: `pnpm --filter @lol-viewer/desktop test -- src/main/lcu/match-adapter.test.ts src/main/match/match-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/lcu/match-adapter.ts apps/desktop/src/main/lcu/match-adapter.test.ts apps/desktop/src/main/match/match-service.ts
git commit -m "refactor: parameterize match history limits"
```

---

### Task 3: Add Personal History Cache and Service

**Files:**
- Modify: `apps/desktop/src/main/cache/database.ts`
- Modify: `apps/desktop/src/main/cache/database.test.ts`
- Create: `apps/desktop/src/main/history/personal-history-service.ts`
- Create: `apps/desktop/src/main/history/personal-history-service.test.ts`

**Interfaces:**
- Produces: `PersonalHistoryCache.getFresh()`, `getLatest(playerId?)`, `put()`, `clear()`, and `PersonalHistoryService.load()`.
- Consumes: `LcuClient`, `adaptMatchHistory(... limit: 20)`, and `PersonalHistorySnapshot`.

- [ ] **Step 1: Write failing cache and service tests**

Cover four behaviors with concrete fixtures:

```ts
it('returns a fresh personal snapshot and marks latest fallback cached', () => {
  const cache = new PersonalHistoryCache(database);
  cache.put(snapshot, 1_000);
  expect(cache.getFresh('7', 1_001)).toEqual(snapshot);
  expect(cache.getLatest('7')).toEqual({ ...snapshot, cached: true });
  expect(cache.getLatest()).toEqual({ ...snapshot, cached: true });
});

it('loads twenty matches and computes aggregate KDA and favorites', async () => {
  const result = await service.load();
  expect(result.matches).toHaveLength(20);
  expect(result.averageKda).toBeCloseTo((totalKills + totalAssists) / Math.max(1, totalDeaths));
  expect(result.favoriteChampions[0]).toMatchObject({ championId: 1, games: 4 });
  expect(result.cached).toBe(false);
});

it('returns latest cache when LCU becomes unavailable', async () => {
  await expect(offlineService.load()).resolves.toEqual({ ...snapshot, cached: true });
});

it('throws a sanitized unavailable error without cache', async () => {
  await expect(offlineService.load()).rejects.toMatchObject({ code: 'HISTORY_UNAVAILABLE' });
});
```

- [ ] **Step 2: Run the new tests and observe RED**

Run: `pnpm --filter @lol-viewer/desktop test -- src/main/cache/database.test.ts src/main/history/personal-history-service.test.ts`

Expected: FAIL because migration 3, cache, and service are absent.

- [ ] **Step 3: Add migration 3 and cache implementation**

Migration SQL:

```sql
CREATE TABLE personal_history_snapshots (
  player_id TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  cached_at INTEGER NOT NULL
);
```

Implement `PersonalHistoryCache` using `personalHistorySchema`, a 15-minute fresh TTL, and `getLatest(playerId?: string)` that ignores TTL and returns `{ ...snapshot, cached: true }`. When `playerId` is omitted, query `ORDER BY cached_at DESC LIMIT 1`; this is the offline-startup fallback when LCU cannot identify the current summoner. Reject future timestamps and invalid JSON exactly as `MatchCache` does. Extend settings cache clearing to call `personalHistoryCache.clear()`.

- [ ] **Step 4: Implement `PersonalHistoryService.load()`**

Use these LCU endpoints:

```ts
const summoner = await client.get('/lol-summoner/v1/current-summoner', currentSummonerSchema);
const history = adaptMatchHistory(await client.get(
  `/lol-match-history/v1/products/lol/${encodeURIComponent(String(summoner.summonerId))}/matches?begIndex=0&endIndex=40`,
  matchHistoryResponseSchema
), { scope: 'all', limit: 20 });
```

Fetch rank and patch independently. Compute wins, losses, win rate, `averageKda = (kills + assists) / max(1, deaths)`, and the top five champion groups sorted by games descending then champion ID ascending. Persist successful snapshots. On any required-request failure, return `cache.getLatest(playerId)` when the current summoner ID is known, otherwise `cache.getLatest()`; throw `Object.assign(new Error('Personal history is unavailable'), { code: 'HISTORY_UNAVAILABLE' })` only when neither cache lookup succeeds.

- [ ] **Step 5: Run cache and service tests**

Run: `pnpm --filter @lol-viewer/desktop test -- src/main/cache/database.test.ts src/main/history/personal-history-service.test.ts`

Expected: PASS, including migration idempotency with versions `[1, 2, 3]`.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/cache/database.ts apps/desktop/src/main/cache/database.test.ts apps/desktop/src/main/history
git commit -m "feat: load and cache personal history"
```

---

### Task 4: Expose Personal History Through Secure IPC

**Files:**
- Create: `apps/desktop/src/main/ipc/register-history-ipc.ts`
- Create: `apps/desktop/src/main/ipc/register-history-ipc.test.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/preload/index.test.ts`
- Modify: `apps/desktop/src/main/index.ts`

**Interfaces:**
- Produces: `registerHistoryIpc(service)` and renderer API `getPersonalHistory()`.
- Consumes: `PersonalHistoryService.load()` and `personalHistorySchema`.

- [ ] **Step 1: Write failing IPC and preload tests**

```ts
it('authorizes, validates, and returns personal history', async () => {
  registerHistoryIpc({ load: vi.fn().mockResolvedValue(snapshot) });
  await expect(handler(authorizedEvent, undefined)).resolves.toEqual(snapshot);
  await expect(handler(authorizedEvent, { unexpected: true })).rejects.toThrow();
});

it('preload invokes history:get-personal and validates its response', async () => {
  ipcRenderer.invoke.mockResolvedValue(snapshot);
  await expect(api.getPersonalHistory()).resolves.toEqual(snapshot);
  expect(ipcRenderer.invoke).toHaveBeenCalledWith('history:get-personal');
});
```

- [ ] **Step 2: Run IPC/preload tests and observe RED**

Run: `pnpm --filter @lol-viewer/desktop test -- src/main/ipc/register-history-ipc.test.ts src/preload/index.test.ts`

Expected: FAIL because handler and preload method do not exist.

- [ ] **Step 3: Implement the handler and bridge**

```ts
export function registerHistoryIpc(service: { load(): Promise<PersonalHistorySnapshot> }): void {
  ipcMain.handle(PERSONAL_HISTORY_GET_CHANNEL, async (event, input) => {
    assertAuthorizedRenderer(event);
    z.undefined().parse(input);
    return personalHistorySchema.parse(await service.load());
  });
}
```

In preload:

```ts
getPersonalHistory: async () => personalHistorySchema.parse(
  await ipcRenderer.invoke(PERSONAL_HISTORY_GET_CHANNEL)
),
```

In main startup, construct `PersonalHistoryCache`, register `PersonalHistoryService`, and return a deterministic personal fixture when fixture mode is active.

- [ ] **Step 4: Run IPC, preload, and type tests**

Run: `pnpm --filter @lol-viewer/desktop test -- src/main/ipc/register-history-ipc.test.ts src/preload/index.test.ts && pnpm --filter @lol-viewer/desktop typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/ipc/register-history-ipc.ts apps/desktop/src/main/ipc/register-history-ipc.test.ts apps/desktop/src/preload/index.ts apps/desktop/src/preload/index.test.ts apps/desktop/src/main/index.ts apps/desktop/src/main/fixtures/live-match.ts
git commit -m "feat: expose personal history ipc"
```

---

### Task 5: Support All Live Modes and Deterministic Pairing

**Files:**
- Modify: `apps/desktop/src/main/match/match-service.ts`
- Modify: `apps/desktop/src/main/match/match-service.test.ts`
- Modify: `apps/desktop/src/renderer/src/features/live/LiveMatchPage.tsx`
- Modify: `apps/desktop/src/renderer/src/features/live/LiveMatchPage.test.tsx`

**Interfaces:**
- Produces: live `queueId`, `modeName`, `positionOrderReliable`; `teamSlots(players, reliable)`.
- Consumes: session `gameData.queue.id` and optional participant positions.

- [ ] **Step 1: Write failing service and ordering tests**

```ts
it('returns ARAM metadata and keeps all-mode player histories', async () => {
  session.gameData.queue = { id: 450 };
  session.gameData.teamOne.forEach((player) => { delete player.selectedPosition; });
  const result = await service.loadLiveMatch('all', vi.fn());
  expect(result).toMatchObject({ queueId: 450, modeName: '极地大乱斗', positionOrderReliable: false });
  expect(result.players.map((player) => player.playerId).slice(0, 5)).toEqual(['1', '2', '3', '4', '5']);
});

it('uses roster order when positions are unreliable', () => {
  expect(teamSlots(scrambledPlayers, false).map((slot) => slot.player?.playerId)).toEqual(
    scrambledPlayers.map((player) => player.playerId)
  );
});
```

- [ ] **Step 2: Run match tests and observe RED**

Run: `pnpm --filter @lol-viewer/desktop test -- src/main/match/match-service.test.ts src/renderer/src/features/live/LiveMatchPage.test.tsx`

Expected: FAIL because live metadata and reliable-order parameter do not exist.

- [ ] **Step 3: Extend session parsing and return metadata**

Extend the strict required portion of `gameData` without rejecting harmless unknown LCU fields:

```ts
gameData: z.object({
  queue: z.object({ id: z.number().int().nonnegative() }).optional(),
  queueId: z.number().int().nonnegative().optional(),
  teamOne: z.array(participantSchema).length(5),
  teamTwo: z.array(participantSchema).length(5)
})
```

Resolve `queueId = session.gameData.queue?.id ?? session.gameData.queueId ?? 0`. Set `positionOrderReliable` only when the queue is not 450 and each team contains exactly one of every canonical lane. Always request player history with `{ scope: 'all', limit: 10 }`, independent of current queue. Return `describeQueue(queueId)` as `modeName`.

- [ ] **Step 4: Implement reliable versus roster slots**

```ts
export function teamSlots(players: PlayerSnapshot[], reliable: boolean): Slot[] {
  if (!reliable) return players.slice(0, 5).map((player, index) => ({
    lane: lanes[index], player, uncertain: false, label: `阵容 ${index + 1}`
  }));
  return buildCanonicalLaneSlots(players);
}
```

Render `slot.label ?? laneNames[slot.lane]`, and suppress lane-difference wording for roster-order slots.

- [ ] **Step 5: Run service and component tests**

Run: `pnpm --filter @lol-viewer/desktop test -- src/main/match/match-service.test.ts src/renderer/src/features/live/LiveMatchPage.test.tsx`

Expected: PASS for ranked, normal, ARAM, team orientation, and partial player failures.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/main/match/match-service.ts apps/desktop/src/main/match/match-service.test.ts apps/desktop/src/renderer/src/features/live/LiveMatchPage.tsx apps/desktop/src/renderer/src/features/live/LiveMatchPage.test.tsx
git commit -m "feat: compare all live game modes"
```

---

### Task 6: Build the Fixed Three-Tab Shell and Personal Page

**Files:**
- Create: `apps/desktop/src/renderer/src/AppShell.tsx`
- Create: `apps/desktop/src/renderer/src/AppShell.test.tsx`
- Create: `apps/desktop/src/renderer/src/features/history/PersonalHistoryPage.tsx`
- Create: `apps/desktop/src/renderer/src/features/history/PersonalHistoryPage.test.tsx`
- Create: `apps/desktop/src/renderer/src/features/history/personal-history.css`
- Modify: `apps/desktop/src/renderer/src/features/champions/ChampionLibraryPage.tsx`

**Interfaces:**
- Produces: `AppTab = 'history' | 'live' | 'champions'`, `AppShell`, and `PersonalHistoryPage`.
- Consumes: validated `PersonalHistorySnapshot`.

- [ ] **Step 1: Write failing navigation and history rendering tests**

```tsx
it('defaults to history and exposes three accessible tabs', () => {
  render(<AppShell active="history" onChange={vi.fn()}><p>History body</p></AppShell>);
  expect(screen.getByRole('tab', { name: '战绩' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getAllByRole('tab')).toHaveLength(3);
});

it('renders summary, favorites, and twenty match rows', () => {
  render(<PersonalHistoryPage snapshot={snapshotWith20Matches} state="ready" />);
  expect(screen.getByText('最近 20 场')).toBeVisible();
  expect(screen.getAllByTestId('personal-match')).toHaveLength(20);
  expect(screen.getByText('缓存数据')).toBeVisible();
});
```

- [ ] **Step 2: Run component tests and observe RED**

Run: `pnpm --filter @lol-viewer/desktop test -- src/renderer/src/AppShell.test.tsx src/renderer/src/features/history/PersonalHistoryPage.test.tsx`

Expected: FAIL because both components are absent.

- [ ] **Step 3: Implement `AppShell`**

Use a `nav` containing `role="tablist"` and three buttons with `role="tab"`, `aria-selected`, and `aria-controls`. Keep the product name at left and the tabs in the same top bar. Do not mount duplicate navigation inside child pages.

- [ ] **Step 4: Implement `PersonalHistoryPage`**

Render these states explicitly:

```tsx
if (state === 'loading') return <main><p role="status">正在加载个人战绩…</p></main>;
if (state === 'unavailable') return <main><p role="alert">请先启动英雄联盟客户端</p></main>;
```

For ready state, render player identity, rank fallback, wins/losses/win rate/average KDA, up to five favorite champions, and all `snapshot.matches.slice(0, 20)`. Reuse champion icon URL construction, but render queue label with `describeQueue` logic duplicated as a renderer-safe shared helper or carried on the match domain; do not import main-process modules into renderer code.

- [ ] **Step 5: Remove champion-library back navigation and style pages**

Remove `onBack` and its button from `ChampionLibraryPage`. Add focus-visible tab styles, a responsive history summary grid, favorite cards, and 20 compact match rows in `personal-history.css`.

- [ ] **Step 6: Run component tests**

Run: `pnpm --filter @lol-viewer/desktop test -- src/renderer/src/AppShell.test.tsx src/renderer/src/features/history/PersonalHistoryPage.test.tsx src/renderer/src/features/champions/ChampionLibraryPage.test.tsx`

Expected: PASS after champion tests navigate only through their own loading/guide states.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/renderer/src/AppShell.tsx apps/desktop/src/renderer/src/AppShell.test.tsx apps/desktop/src/renderer/src/features/history apps/desktop/src/renderer/src/features/champions/ChampionLibraryPage.tsx apps/desktop/src/renderer/src/features/champions/ChampionLibraryPage.test.tsx
git commit -m "feat: add three-tab app shell and history page"
```

---

### Task 7: Make Page Loading Lazy, Cancellable, and Honest

**Files:**
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/App.test.tsx`
- Modify: `apps/desktop/src/renderer/src/features/live/LiveMatchPage.tsx`
- Modify: `apps/desktop/src/renderer/src/features/live/live-match.css`
- Modify: `apps/desktop/src/renderer/src/features/live/RecentMatch.tsx`

**Interfaces:**
- Consumes: `AppShell`, `getPersonalHistory()`, `getLiveMatch('all', generation)`, `cancelLiveMatch()`.
- Produces: default personal load, live-only subscription, and clean waiting states.

- [ ] **Step 1: Replace old App tests with failing lifecycle tests**

```tsx
it('loads only personal history on startup', async () => {
  render(<App />);
  await screen.findByText('最近 20 场');
  expect(api.getPersonalHistory).toHaveBeenCalledOnce();
  expect(api.getLiveMatch).not.toHaveBeenCalled();
});

it('starts live loading on tab entry and cancels on exit', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('tab', { name: '对战信息' }));
  await waitFor(() => expect(api.getLiveMatch).toHaveBeenCalledWith('all', expect.any(Number)));
  fireEvent.click(screen.getByRole('tab', { name: '英雄资料库' }));
  await waitFor(() => expect(api.cancelLiveMatch).toHaveBeenCalledOnce());
});

it('shows lobby waiting without ten placeholder cards', async () => {
  api.getLiveMatch.mockImplementation(() => new Promise(() => undefined));
  render(<App />);
  fireEvent.click(screen.getByRole('tab', { name: '对战信息' }));
  expect(await screen.findByText('等待进入英雄选择或游戏')).toBeVisible();
  expect(screen.queryByTestId('player-slot')).not.toBeInTheDocument();
});
```

Keep a stale-generation test that emits a player after leaving live and verifies it is ignored.

- [ ] **Step 2: Run App tests and observe RED**

Run: `pnpm --filter @lol-viewer/desktop test -- src/renderer/src/App.test.tsx`

Expected: FAIL because the existing app auto-loads live data and has no tab shell.

- [ ] **Step 3: Refactor App into page-owned effects**

Initialize `activeTab` to `'history'`. The history effect runs only when `activeTab === 'history'` and no ready snapshot exists. The live effect runs only when `activeTab === 'live'`; it subscribes before requesting `getLiveMatch('all', generation)`, and cleanup sets `active = false`, unsubscribes, and calls `cancelLiveMatch()`.

Do not turn expected coordinator waiting into an error. Render the live notice as:

```tsx
const liveNotice = liveState === 'waiting'
  ? <p role="status" className="live-match-page__notice">等待进入英雄选择或游戏</p>
  : liveState === 'error'
    ? <p role="alert" className="live-match-page__notice live-match-page__notice--error">对战信息暂时无法读取，请重试</p>
    : null;
```

Only render the 2×5 grid after the first progressive player arrives or a complete match exists. A rejected IPC promise is a genuine error; a pending coordinator promise is lobby waiting.

- [ ] **Step 4: Simplify live controls and show mode**

Remove queue-scope buttons and settings-driven auto-open behavior from the main content. Display `match.modeName` beside “对战信息”. Keep cache clearing and lane-difference settings in a compact settings affordance if still needed, but they must not replace the three primary Tabs.

Update `RecentMatch` to show a shared queue label next to K/D/A when used by the personal page, without changing the ten-row card density beyond available width.

- [ ] **Step 5: Run renderer tests**

Run: `pnpm --filter @lol-viewer/desktop test -- src/renderer/src/App.test.tsx src/renderer/src/features/live/LiveMatchPage.test.tsx src/renderer/src/features/history/PersonalHistoryPage.test.tsx`

Expected: PASS for default history, lazy live, cancellation, lobby waiting, progressive players, and stale generations.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/src/App.tsx apps/desktop/src/renderer/src/App.test.tsx apps/desktop/src/renderer/src/features/live
git commit -m "feat: load tab data on demand"
```

---

### Task 8: Fixtures, End-to-End Verification, and Windows Package

**Files:**
- Modify: `apps/desktop/src/main/fixtures/live-match.ts`
- Modify: `apps/desktop/tests/e2e/live-match.spec.ts`
- Modify: `apps/desktop/README.md` if user-facing run behavior is documented there; otherwise do not create a README solely for this task.

**Interfaces:**
- Produces: deterministic personal and live fixtures for packaged-renderer verification.

- [ ] **Step 1: Write the expanded failing E2E test**

```ts
test('three tabs load personal history first and live comparison on demand', async () => {
  const app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js'), '--fixture-live-match'],
    env: { ...process.env, PLAYWRIGHT_TEST: '1' }
  });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('tab')).toHaveCount(3);
    await expect(page.getByRole('tab', { name: '战绩' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('personal-match')).toHaveCount(20);
    await expect(page.getByTestId('player-card')).toHaveCount(0);
    await page.getByRole('tab', { name: '对战信息' }).click();
    await expect(page.getByTestId('player-card')).toHaveCount(10);
    await expect(page.getByTestId('recent-match')).toHaveCount(100);
    await page.getByRole('tab', { name: '英雄资料库' }).click();
    await expect(page.getByRole('heading', { name: '英雄资料库' })).toBeVisible();
  } finally { await app.close(); }
});
```

- [ ] **Step 2: Run E2E and observe RED**

Run: `pnpm --filter @lol-viewer/desktop test:e2e`

Expected: FAIL until the fixture exposes 20 personal matches and navigation is wired.

- [ ] **Step 3: Complete deterministic fixtures**

Add `createFixturePersonalHistory()` with 20 matches containing ranked, normal, and ARAM queue IDs. Make `createFixtureLiveMatch()` return required mode metadata. Keep fixture mode guarded by both non-packaged execution and explicit test/development environment.

- [ ] **Step 4: Run the complete verification suite**

Run: `pnpm --filter @lol-viewer/desktop verify && pnpm --filter @lol-viewer/desktop test:e2e`

Expected:

- all Vitest suites pass with zero failed tests;
- TypeScript exits 0;
- Electron better-sqlite3 rebuild completes;
- SQLite smoke prints `value=42`;
- production main/preload/renderer build exits 0;
- Playwright sees three Tabs, 20 personal rows, 10 live cards, and 100 live records.

- [ ] **Step 5: Request code review and fix only verified findings**

Use `superpowers:requesting-code-review`. Re-run the exact focused test for each accepted finding, then repeat the full command from Step 4.

- [ ] **Step 6: Commit verified release changes**

```bash
git add apps/desktop/src/main/fixtures/live-match.ts apps/desktop/tests/e2e/live-match.spec.ts apps/desktop/README.md
git commit -m "test: verify three-tab desktop experience"
```

Omit `apps/desktop/README.md` from `git add` if it does not exist or did not require an update.

- [ ] **Step 7: Build and hash the unsigned Windows installer**

Run from a short-path packaging worktree if NSIS exceeds Windows path limits:

```powershell
pnpm --filter @lol-viewer/desktop package:win
Get-FileHash -Algorithm SHA256 apps/desktop/dist/lol-viewer-0.0.0-windows-x64-setup.exe
```

Expected: packaging exits 0 and prints a SHA-256 hash for the new installer. Do not claim real CN-client smoke coverage unless it was run with an open consenting client.

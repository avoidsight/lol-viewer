# 英雄出装与对位数据服务 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付只管理公共英雄统计的轻量服务，为桌面端提供版本化出装、优势对位、劣势对位和来源元数据，并在上游失败时保留最近成功快照。

**Architecture:** Fastify 提供只读 HTTP API，SQLite 保存不可变版本快照，独立同步命令获取并标准化来源数据。来源适配器与领域模型隔离，首版先支持经过人工导入的合法快照，再启用低频 OPGG 同步；任何来源都不能接收玩家标识或历史战绩。

**Tech Stack:** Node.js 22、pnpm 10、TypeScript 5.8、Fastify 5、Zod 3、better-sqlite3 11、Vitest 3、undici 7、Pino 9。

## Global Constraints

- 服务不得接收、记录或存储具体玩家标识和历史战绩。
- 国服统计可用时优先展示；否则提供 OPGG 韩服或全球统计。
- 不混合不同来源的统计值。
- 每个响应必须包含来源、区域、目标段位、版本和更新时间。
- OPGG 同步必须注明来源、低频限速，并在上线前复核最新使用规则。
- 上游同步失败不得删除最近成功快照。

---

## File Structure

```text
apps/champion-data/
  src/domain/champion-guide.ts        公共英雄资料类型与 schema
  src/storage/database.ts             SQLite 迁移与版本快照仓库
  src/sources/source-adapter.ts       来源适配器接口
  src/sources/manual-json.ts          合法 JSON 快照导入
  src/sources/opgg.ts                 OPGG 低频同步适配器
  src/sync/sync-service.ts            校验、写入与失败保留
  src/http/server.ts                  Fastify 只读接口
  src/cli/sync.ts                     定时任务入口
  tests/fixtures/                     来源响应与标准快照
```

### Task 1: 定义英雄资料契约与服务骨架

**Files:**
- Create: `apps/champion-data/package.json`
- Create: `apps/champion-data/src/domain/champion-guide.ts`
- Create: `apps/champion-data/src/http/server.ts`
- Test: `apps/champion-data/src/domain/champion-guide.test.ts`

**Interfaces:**
- Produces: `ChampionGuideSchema`, `ChampionGuide`, `BuildPath`, and `MatchupStat`.
- Produces: `buildServer(repository): FastifyInstance`.

- [ ] **Step 1: Write failing schema test**

```ts
it('requires source, region, tier, patch and fetchedAt', () => {
  expect(() => ChampionGuideSchema.parse({ championId: 114, lane: 'TOP' })).toThrow();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @lol-viewer/champion-data test -- champion-guide.test.ts`

Expected: FAIL because the package and schema do not exist.

- [ ] **Step 3: Implement exact contract**

```ts
export const ChampionGuideSchema = z.object({
  championId: z.number().int().positive(), lane: z.enum(['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY']),
  patch: z.string().regex(/^\d+\.\d+$/), source: z.enum(['CN_OFFICIAL','OPGG','MANUAL']),
  region: z.string().min(2), tier: z.string().min(1), fetchedAt: z.string().datetime(),
  builds: z.array(z.object({ itemIds: z.array(z.number().int().positive()).min(2), pickRate: z.number().min(0).max(1).optional() })),
  favorable: z.array(z.object({ opponentChampionId: z.number().int().positive(), winRate: z.number().min(0).max(1), games: z.number().int().nonnegative().optional() })),
  unfavorable: z.array(z.object({ opponentChampionId: z.number().int().positive(), winRate: z.number().min(0).max(1), games: z.number().int().nonnegative().optional() })),
  notes: z.array(z.string().max(240)).max(5)
});
```

- [ ] **Step 4: Run test and typecheck**

Run: `pnpm --filter @lol-viewer/champion-data test && pnpm --filter @lol-viewer/champion-data typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/champion-data package.json pnpm-workspace.yaml
git commit -m "feat: define champion guide service contract"
```

### Task 2: 保存不可变版本快照

**Files:**
- Create: `apps/champion-data/src/storage/database.ts`
- Test: `apps/champion-data/src/storage/database.test.ts`

**Interfaces:**
- Produces: `GuideRepository.put(guide)`, `.get(patch, championId, lane, source)`, and `.getLatest(championId, lane)`.

- [ ] **Step 1: Write failing version and source isolation tests**

```ts
it('keeps separate snapshots for each patch and source', () => {
  repo.put(opggGuide); repo.put(cnGuide);
  expect(repo.get('16.14', 114, 'TOP', 'OPGG')?.source).toBe('OPGG');
  expect(repo.get('16.14', 114, 'TOP', 'CN_OFFICIAL')?.source).toBe('CN_OFFICIAL');
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @lol-viewer/champion-data test -- database.test.ts`

Expected: FAIL because the repository is missing.

- [ ] **Step 3: Implement repository**

Use a composite primary key `(patch, champion_id, lane, source, region, tier)`, store the validated guide as JSON, and order latest results by `fetched_at`. Inserts use transactions and never overwrite another source.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @lol-viewer/champion-data test -- database.test.ts`

Expected: PASS with an in-memory database.

- [ ] **Step 5: Commit**

```bash
git add apps/champion-data/src/storage
git commit -m "feat: persist versioned champion snapshots"
```

### Task 3: 支持审核后的 JSON 快照导入

**Files:**
- Create: `apps/champion-data/src/sources/source-adapter.ts`
- Create: `apps/champion-data/src/sources/manual-json.ts`
- Create: `apps/champion-data/src/sync/sync-service.ts`
- Test: `apps/champion-data/src/sync/sync-service.test.ts`
- Create: `apps/champion-data/tests/fixtures/manual-guide.json`

**Interfaces:**
- Produces: `SourceAdapter.fetch(context): Promise<ChampionGuide[]>`.
- Produces: `SyncService.run(adapter, context): Promise<{ inserted: number; errors: SyncError[] }>`.

- [ ] **Step 1: Write failing atomic-import test**

```ts
it('does not delete the previous snapshot when the new file is invalid', async () => {
  repo.put(previousGuide);
  const result = await service.run(invalidAdapter, context);
  expect(result.inserted).toBe(0);
  expect(repo.getLatest(114, 'TOP')).toEqual(previousGuide);
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @lol-viewer/champion-data test -- sync-service.test.ts`

Expected: FAIL because sync modules do not exist.

- [ ] **Step 3: Implement validate-then-commit sync**

Parse the entire adapter output before opening the write transaction. Reject duplicate compound keys, return structured errors, and commit all valid guides together. Log only source metadata and counts.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @lol-viewer/champion-data test -- sync-service.test.ts`

Expected: PASS; prior snapshot remains readable after invalid import.

- [ ] **Step 5: Commit**

```bash
git add apps/champion-data/src/sources apps/champion-data/src/sync apps/champion-data/tests
git commit -m "feat: import validated champion guide snapshots"
```

### Task 4: 提供版本化只读 API

**Files:**
- Modify: `apps/champion-data/src/http/server.ts`
- Test: `apps/champion-data/src/http/server.test.ts`

**Interfaces:**
- Produces: `GET /health`.
- Produces: `GET /v1/patches/:patch/champions/:championId?lane=TOP&source=CN_OFFICIAL`.
- Produces: `GET /v1/champions/:championId/latest?lane=TOP` with CN-first fallback.

- [ ] **Step 1: Write failing API tests**

```ts
it('prefers a CN snapshot and falls back to OPGG without mixing them', async () => {
  const response = await app.inject({ method: 'GET', url: '/v1/champions/114/latest?lane=TOP' });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({ source: 'CN_OFFICIAL', championId: 114 });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @lol-viewer/champion-data test -- server.test.ts`

Expected: FAIL with route not found.

- [ ] **Step 3: Implement routes and cache headers**

Validate params and queries with Zod, return 404 when no source exists, add `ETag`, `Cache-Control: public, max-age=3600`, and `X-Data-Fetched-At`. The latest route checks `CN_OFFICIAL`, then `OPGG`, then `MANUAL`; it returns exactly one source snapshot.

- [ ] **Step 4: Run API tests**

Run: `pnpm --filter @lol-viewer/champion-data test -- server.test.ts`

Expected: PASS including 400 and 404 cases.

- [ ] **Step 5: Commit**

```bash
git add apps/champion-data/src/http
git commit -m "feat: expose read-only champion guide API"
```

### Task 5: 实现受限速的 OPGG 来源适配器

**Files:**
- Create: `apps/champion-data/src/sources/opgg.ts`
- Test: `apps/champion-data/src/sources/opgg.test.ts`
- Create: `apps/champion-data/tests/fixtures/opgg-response.html`
- Create: `apps/champion-data/src/cli/sync.ts`

**Interfaces:**
- Consumes: `SourceAdapter` and `SyncService.run`.
- Produces: `OpggSource({ minIntervalMs, userAgent, fetchImpl })`.

- [ ] **Step 1: Write failing source attribution and rate-limit tests**

```ts
it('waits at least two seconds between upstream requests and marks OPGG attribution', async () => {
  const guides = await adapter.fetch(context);
  expect(requestTimes[1] - requestTimes[0]).toBeGreaterThanOrEqual(2000);
  expect(guides.every(g => g.source === 'OPGG')).toBe(true);
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @lol-viewer/champion-data test -- opgg.test.ts`

Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Implement fixture-first parser and guarded live fetch**

Parse the checked-in fixture with stable semantic selectors and Zod validation. Default `minIntervalMs` to 2000, cap retries at two, set a descriptive user agent with contact information from configuration, and disable live fetching unless `ENABLE_OPGG_SYNC=true`. Abort a sync when the page shape no longer validates; retain the prior snapshot.

- [ ] **Step 4: Run parser and sync tests without network**

Run: `pnpm --filter @lol-viewer/champion-data test -- opgg.test.ts sync-service.test.ts`

Expected: PASS using only fixtures; zero real network calls.

- [ ] **Step 5: Commit**

```bash
git add apps/champion-data/src/sources/opgg.ts apps/champion-data/src/cli apps/champion-data/tests/fixtures/opgg-response.html
git commit -m "feat: add guarded OPGG snapshot sync"
```

### Task 6: 完成部署与契约验证

**Files:**
- Create: `apps/champion-data/Dockerfile`
- Create: `apps/champion-data/src/http/contract.test.ts`
- Create: `apps/champion-data/docs/operations.md`
- Modify: `apps/champion-data/package.json`

**Interfaces:**
- Produces: `start`, `sync`, `test`, and `typecheck` scripts.
- Guarantees the API contract consumed by desktop Task 7.

- [ ] **Step 1: Write failing desktop-contract test**

```ts
it('returns a response accepted by the desktop ChampionGuide schema', async () => {
  const response = await app.inject({ method: 'GET', url: '/v1/patches/16.14/champions/114?lane=TOP' });
  expect(ChampionGuideSchema.safeParse(response.json()).success).toBe(true);
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @lol-viewer/champion-data test -- contract.test.ts`

Expected: FAIL until the shared contract import and seeded repository exist.

- [ ] **Step 3: Share the contract and add operations runbook**

Move the response schema to `packages/contracts/src/champion-guide.ts`, import it from both apps, and document database backup, manual import, sync scheduling, rollback, source attribution, and the pre-release terms review checklist. Build a non-root container with a writable `/data` volume.

- [ ] **Step 4: Run complete verification**

Run: `pnpm --filter @lol-viewer/champion-data test && pnpm --filter @lol-viewer/champion-data typecheck && docker build -t lol-champion-data:local apps/champion-data`

Expected: tests and typecheck PASS; Docker image builds successfully and `/health` returns 200 when run with a writable data volume.

- [ ] **Step 5: Commit**

```bash
git add apps/champion-data packages/contracts
git commit -m "chore: package and document champion data service"
```

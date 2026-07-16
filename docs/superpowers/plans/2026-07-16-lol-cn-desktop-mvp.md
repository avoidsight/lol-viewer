# 国服英雄联盟实时对局查看器桌面端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可安装的 Windows 桌面 MVP，能检测本机英雄联盟客户端、加载十名玩家最近十场，并以 2×5 页面展示英雄图标、胜负与 K/D/A，同时提供离线英雄资料库入口。

**Architecture:** 使用 Electron 主进程隔离本地客户端访问、缓存和网络调用，React 渲染进程只消费类型安全的 IPC 接口。客户端响应先经适配器转换为领域模型，再进入协调器与 UI；SQLite 仅存短期缓存和设置。首轮开发使用脱敏 fixtures 完成完整纵向切片，最后再对真实国服客户端做适配验证。

**Tech Stack:** Node.js 22、pnpm 10、Electron 37、electron-vite 3、React 19、TypeScript 5.8、Vitest 3、Testing Library、Zod 3、better-sqlite3 11、Playwright 1.53。

## Global Constraints

- 目标平台为 Windows 10/11 x64。
- 首版使用独立桌面窗口，不注入游戏进程、不修改游戏文件、不提供游戏内悬浮层。
- 云端不接收或保存具体玩家历史战绩。
- 默认统计最近 10 场单双排，用户可切换全部匹配与排位模式。
- 单场只展示可验证的英雄、胜负、K/D/A，不计算综合评分。
- 十名玩家必须以我方在上、敌方在下、五个位置按列对齐的 2×5 布局呈现。
- 任一玩家读取失败不得阻塞其余玩家。
- 在客户端接口正常且本地网络可用时，进入对局后 15 秒内识别十名玩家并开始逐卡加载。
- 所有外部与客户端响应必须先经 Zod 校验。

---

## File Structure

```text
apps/desktop/
  package.json                         Electron 应用依赖与脚本
  electron.vite.config.ts              主进程、预加载与渲染构建配置
  src/main/index.ts                    Electron 生命周期与窗口创建
  src/main/ipc/register-match-ipc.ts   注册对局查询 IPC
  src/main/lcu/discovery.ts             发现 lockfile 并生成连接信息
  src/main/lcu/http-client.ts           本地 HTTPS 调用与认证
  src/main/lcu/match-adapter.ts         客户端响应到领域模型的转换
  src/main/match/match-service.ts       十人并发加载与部分失败协调
  src/main/cache/database.ts            SQLite 初始化与缓存接口
  src/preload/index.ts                  受限的 window.lolViewer API
  src/renderer/src/App.tsx              页面路由与应用状态
  src/renderer/src/features/live/       实时对局 2×5 UI
  src/renderer/src/features/champions/  英雄资料库 UI
  src/shared/domain.ts                  共享领域类型
  src/shared/ipc.ts                     IPC channel 与输入输出 schema
  tests/fixtures/                       脱敏客户端响应
  tests/e2e/live-match.spec.ts          纵向切片端到端测试
packages/ui/                            小型共享视觉组件
```

### Task 1: 建立可测试的 Electron 工作区

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/electron.vite.config.ts`
- Create: `apps/desktop/src/main/index.ts`
- Create: `apps/desktop/src/preload/index.ts`
- Create: `apps/desktop/src/renderer/src/App.tsx`
- Test: `apps/desktop/src/renderer/src/App.test.tsx`

**Interfaces:**
- Produces: `window.lolViewer` preload namespace; later tasks extend it without enabling `nodeIntegration`.

- [ ] **Step 1: Write the failing shell test**

```tsx
// apps/desktop/src/renderer/src/App.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('shows the waiting state before the LoL client is available', () => {
    render(<App />);
    expect(screen.getByText('等待英雄联盟客户端')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @lol-viewer/desktop test -- App.test.tsx`

Expected: FAIL because the workspace and `App` do not exist.

- [ ] **Step 3: Add minimal workspace and application shell**

```tsx
// apps/desktop/src/renderer/src/App.tsx
export default function App() {
  return <main><h1>峡谷对局查看器</h1><p>等待英雄联盟客户端</p></main>;
}
```

Configure Electron with `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`; expose an empty frozen object from preload:

```ts
contextBridge.exposeInMainWorld('lolViewer', Object.freeze({}));
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm install && pnpm --filter @lol-viewer/desktop test && pnpm --filter @lol-viewer/desktop typecheck`

Expected: PASS; TypeScript reports zero errors.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml apps/desktop
git commit -m "chore: scaffold secure Electron desktop app"
```

### Task 2: 定义稳定领域模型与客户端响应适配器

**Files:**
- Create: `apps/desktop/src/shared/domain.ts`
- Create: `apps/desktop/src/main/lcu/match-adapter.ts`
- Test: `apps/desktop/src/main/lcu/match-adapter.test.ts`
- Create: `apps/desktop/tests/fixtures/match-history.json`

**Interfaces:**
- Produces: `QueueScope = 'ranked-solo' | 'all'`.
- Produces: `adaptMatchHistory(input: unknown, scope: QueueScope): MatchSummary[]`.
- Produces: `MatchSummary`, `PlayerSnapshot`, `Lane`, and `DataStatus` types.

- [ ] **Step 1: Write failing adapter tests**

```ts
it('keeps the newest ten solo ranked games and maps KDA', () => {
  const result = adaptMatchHistory(fixture, 'ranked-solo');
  expect(result).toHaveLength(10);
  expect(result[0]).toMatchObject({ championId: 114, win: true, kills: 8, deaths: 3, assists: 4 });
});

it('returns the actual sample when fewer than ten matches exist', () => {
  expect(adaptMatchHistory({ games: fixture.games.slice(0, 3) }, 'all')).toHaveLength(3);
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @lol-viewer/desktop test -- match-adapter.test.ts`

Expected: FAIL with `adaptMatchHistory is not defined`.

- [ ] **Step 3: Implement schemas and pure adapter**

```ts
export type Lane = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY' | 'UNKNOWN';
export type QueueScope = 'ranked-solo' | 'all';
export interface MatchSummary {
  matchId: string; queueId: number; endedAt: number; durationSeconds: number;
  championId: number; win: boolean; kills: number; deaths: number; assists: number;
  cs?: number; lane?: Lane;
}
```

Use a Zod schema that rejects missing champion, win, kills, deaths, or assists; filter `queueId === 420` for `ranked-solo`, sort descending by end time, and call `.slice(0, 10)`.

- [ ] **Step 4: Run focused and full tests**

Run: `pnpm --filter @lol-viewer/desktop test -- match-adapter.test.ts && pnpm --filter @lol-viewer/desktop test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/shared apps/desktop/src/main/lcu apps/desktop/tests/fixtures
git commit -m "feat: normalize recent match history"
```

### Task 3: 发现并连接本机英雄联盟客户端

**Files:**
- Create: `apps/desktop/src/main/lcu/discovery.ts`
- Create: `apps/desktop/src/main/lcu/http-client.ts`
- Test: `apps/desktop/src/main/lcu/discovery.test.ts`
- Test: `apps/desktop/src/main/lcu/http-client.test.ts`

**Interfaces:**
- Produces: `discoverLcuConnection(processes?: ProcessInfo[]): Promise<LcuConnection | null>`.
- Produces: `createLcuClient(connection: LcuConnection): { get(path: string): Promise<unknown> }`.
- `LcuConnection = { port: number; password: string; protocol: 'https' }`.

- [ ] **Step 1: Write failing discovery and HTTP tests**

```ts
it('parses app-port and remoting-auth-token without logging the token', async () => {
  const result = await discoverLcuConnection([{ commandLine: '--app-port=53122 --remoting-auth-token=secret' }]);
  expect(result).toEqual({ port: 53122, password: 'secret', protocol: 'https' });
});

it('returns a typed unavailable error on ECONNREFUSED', async () => {
  await expect(client.get('/lol-gameflow/v1/gameflow-phase')).rejects.toMatchObject({ code: 'LCU_UNAVAILABLE' });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @lol-viewer/desktop test -- discovery.test.ts http-client.test.ts`

Expected: FAIL because discovery and client modules do not exist.

- [ ] **Step 3: Implement connection discovery and HTTPS client**

Parse the LeagueClientUx process command line first, then fall back to a configurable lockfile path. Send Basic auth as `riot:<token>`, accept only loopback hosts, use a 5-second timeout, never serialize the token into errors, logs, renderer IPC, or SQLite.

```ts
export interface LcuError extends Error { code: 'LCU_UNAVAILABLE' | 'LCU_AUTH' | 'LCU_INVALID_RESPONSE' }
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @lol-viewer/desktop test -- discovery.test.ts http-client.test.ts`

Expected: PASS, including token-redaction assertion.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/lcu
git commit -m "feat: connect safely to local League client"
```

### Task 4: 并发加载十名玩家并支持部分失败

**Files:**
- Create: `apps/desktop/src/main/match/match-service.ts`
- Test: `apps/desktop/src/main/match/match-service.test.ts`
- Create: `apps/desktop/src/shared/ipc.ts`
- Create: `apps/desktop/src/main/ipc/register-match-ipc.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`

**Interfaces:**
- Consumes: `adaptMatchHistory(input, scope)` and `createLcuClient(connection)`.
- Produces: `loadLiveMatch(scope: QueueScope, onPlayer: (player: PlayerSnapshot) => void): Promise<LiveMatch>`.
- Produces preload API: `getLiveMatch(scope)` and `onPlayerUpdated(listener)`.

- [ ] **Step 1: Write failing partial-success test**

```ts
it('emits nine ready players and one unavailable player without rejecting', async () => {
  const result = await service.loadLiveMatch('ranked-solo', updated.push.bind(updated));
  expect(result.players).toHaveLength(10);
  expect(result.players.filter(p => p.status === 'ready')).toHaveLength(9);
  expect(result.players.filter(p => p.status === 'unavailable')).toHaveLength(1);
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @lol-viewer/desktop test -- match-service.test.ts`

Expected: FAIL because `MatchService` is missing.

- [ ] **Step 3: Implement bounded concurrency and validated IPC**

Use a concurrency limit of four, retry each transient request twice with 250 ms then 750 ms delay, emit each completed player, and return all ten snapshots. Validate `scope` in the main process with `z.enum(['ranked-solo', 'all'])`; expose only named preload methods, never raw `ipcRenderer`.

- [ ] **Step 4: Run tests and IPC security check**

Run: `pnpm --filter @lol-viewer/desktop test -- match-service.test.ts && pnpm --filter @lol-viewer/desktop typecheck`

Expected: PASS; no renderer import from `electron`.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/match apps/desktop/src/main/ipc apps/desktop/src/shared/ipc.ts apps/desktop/src/main/index.ts apps/desktop/src/preload/index.ts
git commit -m "feat: stream partial live match results"
```

### Task 5: 构建 2×5 实时对局页面

**Files:**
- Create: `apps/desktop/src/renderer/src/features/live/LiveMatchPage.tsx`
- Create: `apps/desktop/src/renderer/src/features/live/PlayerCard.tsx`
- Create: `apps/desktop/src/renderer/src/features/live/RecentMatch.tsx`
- Create: `apps/desktop/src/renderer/src/features/live/live-match.css`
- Test: `apps/desktop/src/renderer/src/features/live/LiveMatchPage.test.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `LiveMatch` with ten `PlayerSnapshot` entries.
- Produces: accessible 2×5 grid and scope switch callback `(scope: QueueScope) => void`.

- [ ] **Step 1: Write failing UI test**

```tsx
it('renders two aligned teams and every available recent match', () => {
  render(<LiveMatchPage match={fixtureLiveMatch} />);
  expect(screen.getAllByTestId('player-card')).toHaveLength(10);
  expect(screen.getAllByTestId('recent-match')).toHaveLength(100);
  expect(screen.getByText('8/3/4')).toBeVisible();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @lol-viewer/desktop test -- LiveMatchPage.test.tsx`

Expected: FAIL because the page does not exist.

- [ ] **Step 3: Implement responsive grid and player states**

Render lanes in the fixed order `TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY`; render the local team first. Each match row contains a real image with text fallback, visible `胜/负`, and literal `K/D/A`. Use `min-width: 1050px`; at narrower widths provide horizontal scrolling rather than collapsing lane alignment. Render loading, unavailable, and fewer-than-ten states explicitly.

- [ ] **Step 4: Run unit and accessibility tests**

Run: `pnpm --filter @lol-viewer/desktop test -- LiveMatchPage.test.tsx`

Expected: PASS; wins and losses remain distinguishable without color.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/src
git commit -m "feat: show ten-player recent match comparison"
```

### Task 6: 添加 SQLite 缓存和设置

**Files:**
- Create: `apps/desktop/src/main/cache/database.ts`
- Test: `apps/desktop/src/main/cache/database.test.ts`
- Create: `apps/desktop/src/main/settings/settings-service.ts`
- Test: `apps/desktop/src/main/settings/settings-service.test.ts`
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/src/preload/index.ts`

**Interfaces:**
- Produces: `MatchCache.get(playerId, scope): PlayerSnapshot | null` and `.put(snapshot): void`.
- Produces: `SettingsService.get(): AppSettings`, `.update(patch): AppSettings`, `.clearCache(): void`.
- `AppSettings = { queueScope: QueueScope; autoOpenLiveMatch: boolean; showLaneDifferences: boolean }`.

- [ ] **Step 1: Write failing expiry and clear tests**

```ts
it('does not return player history older than fifteen minutes', () => {
  cache.put(snapshot, now - 16 * 60_000);
  expect(cache.get(snapshot.playerId, 'ranked-solo', now)).toBeNull();
});

it('clears history without deleting settings', () => {
  service.clearCache();
  expect(service.get().queueScope).toBe('ranked-solo');
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @lol-viewer/desktop test -- database.test.ts settings-service.test.ts`

Expected: FAIL because cache and settings modules do not exist.

- [ ] **Step 3: Implement migrations and retention**

Create `player_snapshots`, `app_settings`, and `schema_migrations` tables. Use parameterized statements, a 15-minute player-history TTL, and explicit `clearPlayerSnapshots()`; never persist LCU tokens.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @lol-viewer/desktop test -- database.test.ts settings-service.test.ts`

Expected: PASS using an in-memory database.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/cache apps/desktop/src/main/settings apps/desktop/src/shared/ipc.ts apps/desktop/src/preload/index.ts
git commit -m "feat: cache recent matches and user settings"
```

### Task 7: 接入英雄资料快照与离线页面

**Files:**
- Create: `apps/desktop/src/main/champions/champion-guide-client.ts`
- Test: `apps/desktop/src/main/champions/champion-guide-client.test.ts`
- Create: `apps/desktop/src/renderer/src/features/champions/ChampionLibraryPage.tsx`
- Test: `apps/desktop/src/renderer/src/features/champions/ChampionLibraryPage.test.tsx`
- Modify: `apps/desktop/src/renderer/src/App.tsx`

**Interfaces:**
- Produces: `getChampionGuide(championId, lane): Promise<ChampionGuide>`.
- Consumes cloud endpoint `GET /v1/patches/:patch/champions/:championId?lane=TOP` defined in the companion service plan.

- [ ] **Step 1: Write failing stale-cache fallback test**

```ts
it('returns the last successful guide when the service is offline', async () => {
  await cache.put(guideFixture);
  fetchMock.mockRejectedValue(new Error('offline'));
  await expect(client.getChampionGuide(114, 'TOP')).resolves.toMatchObject({ source: 'OPGG', stale: true });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @lol-viewer/desktop test -- champion-guide-client.test.ts`

Expected: FAIL because the client is missing.

- [ ] **Step 3: Implement validated client and library UI**

Validate server responses, store the last successful snapshot by patch/champion/lane, and show source, region, tier, patch, and fetched time. Render builds, favorable matchups, unfavorable matchups, and admin notes. When no server or cache exists, render `英雄数据暂不可用` without fabricated recommendations.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @lol-viewer/desktop test -- champion-guide-client.test.ts ChampionLibraryPage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/main/champions apps/desktop/src/renderer/src/features/champions apps/desktop/src/renderer/src/App.tsx
git commit -m "feat: add cached champion guide library"
```

### Task 8: 打包、端到端验证与真实客户端冒烟测试

**Files:**
- Create: `apps/desktop/playwright.config.ts`
- Create: `apps/desktop/tests/e2e/live-match.spec.ts`
- Create: `apps/desktop/scripts/lcu-smoke.ts`
- Create: `apps/desktop/docs/testing-cn-client.md`
- Modify: `apps/desktop/package.json`

**Interfaces:**
- Produces: `pnpm --filter @lol-viewer/desktop test:e2e`, `lcu:smoke`, and `package:win` commands.

- [ ] **Step 1: Write failing packaged-app E2E test**

```ts
test('fixture mode renders all ten players and one hundred matches', async () => {
  const startedAt = Date.now();
  const app = await electron.launch({ args: ['.', '--fixture-live-match'] });
  const page = await app.firstWindow();
  await expect(page.getByTestId('player-card')).toHaveCount(10);
  await expect(page.getByTestId('recent-match')).toHaveCount(100);
  expect(Date.now() - startedAt).toBeLessThan(15_000);
  await app.close();
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm --filter @lol-viewer/desktop test:e2e`

Expected: FAIL until fixture launch mode and Playwright config exist.

- [ ] **Step 3: Implement fixture mode, smoke command, and packaging config**

Fixture mode must only activate with the explicit CLI flag in development/test builds. `lcu-smoke` prints endpoint availability and schema compatibility but redacts player names and auth tokens. Configure an unsigned local Windows installer for tester distribution; document that production signing is required before public release.

- [ ] **Step 4: Run complete verification**

Run: `pnpm test && pnpm --filter @lol-viewer/desktop typecheck && pnpm --filter @lol-viewer/desktop test:e2e && pnpm --filter @lol-viewer/desktop package:win`

Expected: all tests PASS and a Windows installer appears under `apps/desktop/dist/`.

With a consenting tester and the CN client open, run: `pnpm --filter @lol-viewer/desktop lcu:smoke`

Expected: phase, participant, and history schemas report compatible; any incompatible endpoint is captured as a redacted fixture before code changes.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop
git commit -m "test: verify and package desktop MVP"
```

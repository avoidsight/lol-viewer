# CN MVP Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the packaged MVP connect to the elevated Tencent League client and show usable champion data without an unshipped localhost service.

**Architecture:** Keep LCU credentials in the Electron main process and require administrator execution on Windows. Keep the existing validated guide client, but add a bundled snapshot provider as its final fallback so first-run installs work offline.

**Tech Stack:** Electron 37, electron-builder, TypeScript, Vitest, Zod, SQLite.

## Global Constraints

- Never log or expose LCU authentication tokens.
- LCU requests remain restricted to `127.0.0.1`.
- Bundled guide data must pass `championGuideSnapshotSchema` and be marked stale/offline.
- Final verification uses the packaged executable against the running Tencent client.

---

### Task 1: Require the Windows privilege level needed by WeGame LCU

**Files:**
- Modify: `apps/desktop/package.json`
- Test: `apps/desktop/scripts/package-config.test.ts`

**Interfaces:**
- Consumes: electron-builder Windows manifest configuration.
- Produces: a Windows executable with `requestedExecutionLevel: "requireAdministrator"`.

- [ ] **Step 1: Write the failing packaging test**

```ts
it('requests administrator rights for Tencent LCU process discovery', () => {
  const desktop = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  expect(desktop.build.win.requestedExecutionLevel).toBe('requireAdministrator');
  expect(desktop.build.win.signAndEditExecutable).toBe(true);
  expect(desktop.build.win.signExecutable).toBe(false);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --dir apps/desktop test`
Expected: FAIL because `requestedExecutionLevel` is absent.

- [ ] **Step 3: Add the minimal builder configuration**

```json
"win": {
  "requestedExecutionLevel": "requireAdministrator",
  "signAndEditExecutable": true,
  "signExecutable": false,
  "target": [{ "target": "nsis", "arch": ["x64"] }]
}
```

- [ ] **Step 4: Run tests and type checking**

Run: `pnpm --dir apps/desktop test && pnpm --dir apps/desktop typecheck`
Expected: all tests pass and TypeScript exits 0.

### Task 2: Bundle a truthful offline champion-guide fallback

**Files:**
- Create: `apps/desktop/src/main/champions/bundled-guide.ts`
- Create: `apps/desktop/src/main/champions/bundled-guide.test.ts`
- Modify: `apps/desktop/src/main/champions/champion-guide-client.ts`
- Modify: `apps/desktop/src/main/champions/champion-guide-client.test.ts`
- Modify: `apps/desktop/src/main/index.ts`

**Interfaces:**
- Produces: `getBundledGuide(championId: number, lane: ChampionLane): ChampionGuideSnapshot | null`.
- Consumes: optional `bundledGuide` callback in `ChampionGuideClient`.

- [ ] **Step 1: Write failing tests for schema validity and final fallback**

```ts
expect(championGuideSnapshotSchema.parse(getBundledGuide(114, 'TOP'))).toBeTruthy();
expect(getBundledGuide(999999, 'TOP')).toBeNull();

const client = new ChampionGuideClient({
  baseUrl: 'https://offline.invalid', patch: '16.14', cache,
  fetch: vi.fn().mockRejectedValue(new Error('offline')),
  bundledGuide: getBundledGuide
});
await expect(client.getChampionGuide(114, 'TOP')).resolves.toMatchObject({
  championId: 114, source: 'MANUAL', stale: true
});
```

- [ ] **Step 2: Run tests and verify the missing fallback fails**

Run: `pnpm --dir apps/desktop test`
Expected: FAIL because `getBundledGuide` and `bundledGuide` do not exist.

- [ ] **Step 3: Add the validated bundled snapshot and fallback**

`getBundledGuide` returns a schema-validated, explicitly `MANUAL` snapshot for the MVP-covered champion/lane. In both patch-discovery failure and fetch/cache failure paths, the client returns `{ ...snapshot, stale: true }` only after cache lookup fails.

- [ ] **Step 4: Wire the provider into production construction**

```ts
registerChampionIpc(new ChampionGuideClient({
  baseUrl,
  getPatch,
  cache: guideCache,
  bundledGuide: getBundledGuide
}));
```

- [ ] **Step 5: Run the complete verification suite**

Run: `pnpm --dir apps/desktop verify`
Expected: all tests, type checking, SQLite smoke test, and production build pass.

### Task 3: Verify the final executable in the real CN environment

**Files:**
- Output: `outputs/lol-viewer-0.0.0-windows-x64-portable-cn-mvp.zip`

**Interfaces:**
- Consumes: final production build and the currently running Tencent client.
- Produces: a hash-identified artifact that has passed real LCU discovery.

- [ ] **Step 1: Build from a short filesystem path**

Run the builder from a short workspace copy or worktree so NSIS does not exceed its path limit.
Expected: installer or portable directory contains the latest `out/main/index.js`.

- [ ] **Step 2: Run the final executable normally and accept UAC**

Expected: 战绩页 no longer says “请先启动英雄联盟客户端”.

- [ ] **Step 3: Verify the three page states**

Expected: 战绩 loads from current-summoner/history; 对战信息 reports no active match outside a game; 英雄资料库 renders the marked offline fallback without `127.0.0.1:8787` being available.

- [ ] **Step 4: Hash and publish only the verified artifact**

Run: `Get-FileHash -Algorithm SHA256 <artifact>`
Expected: a non-empty SHA-256 value tied to the delivered filename.

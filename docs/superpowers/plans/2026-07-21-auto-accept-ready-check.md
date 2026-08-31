# Auto Accept Ready Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default-off persisted toggle that accepts each League Ready Check once while the desktop app is running.

**Architecture:** Extend the existing settings schema and SQLite row with one boolean. Add a small main-process poller that reads settings, discovers LCU, checks gameflow phase, and uses a new authenticated POST method to accept once per ReadyCheck transition.

**Tech Stack:** Electron, TypeScript, React, better-sqlite3, Zod, Vitest.

## Global Constraints

- Only call `POST /lol-matchmaking/v1/ready-check/accept`.
- Default `autoAcceptReadyCheck` to `false` and persist it in SQLite.
- Never expose or log the LCU token.
- Keep the target restricted to `127.0.0.1` and dispose the poller before closing the database.

---

### Task 1: Persist the auto-accept setting

**Files:**
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/src/main/cache/database.ts`
- Modify: `apps/desktop/src/main/settings/settings-service.ts`
- Test: `apps/desktop/src/main/settings/settings-service.test.ts`

**Interfaces:**
- Produces: `AppSettings.autoAcceptReadyCheck: boolean`.
- Produces: migration version 4 adding `auto_accept_ready_check INTEGER NOT NULL DEFAULT 0`.

- [ ] Add failing assertions that defaults return `false`, updates persist `true`, and migration upgrades a version-3 database.
- [ ] Run `pnpm --dir apps/desktop test` and verify schema/default assertions fail.
- [ ] Add the schema field, migration 4, SELECT/INSERT mapping, and default value.
- [ ] Run the settings and migration tests until green.

### Task 2: Add authenticated POST and the background acceptor

**Files:**
- Modify: `apps/desktop/src/main/lcu/http-client.ts`
- Test: `apps/desktop/src/main/lcu/http-client.test.ts`
- Create: `apps/desktop/src/main/match/ready-check-auto-acceptor.ts`
- Create: `apps/desktop/src/main/match/ready-check-auto-acceptor.test.ts`

**Interfaces:**
- Extend `LcuClient` with `post(path: string): Promise<void>`.
- Produce `ReadyCheckAutoAcceptor.start(): void` and `dispose(): void`.

- [ ] Add failing HTTP tests asserting POST uses Basic auth, fixed loopback host, no body, valid path, and accepts 2xx empty responses.
- [ ] Add failing acceptor tests for disabled state, one call per ReadyCheck, reset after leaving, immediate disabled behavior, error isolation, and disposal.
- [ ] Implement `post` using the same timeout/auth/status rules as `get`.
- [ ] Implement a serialized 1000ms poll loop with an injectable scheduler for deterministic tests.
- [ ] Run all main-process tests until green.

### Task 3: Wire the setting and lifecycle

**Files:**
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Test: `apps/desktop/src/renderer/src/App.test.tsx`
- Update fixture settings in preload/IPC tests where strict schemas require the new field.

**Interfaces:**
- Main process constructs the acceptor with `settingsService.get`, `discoverLcuConnection`, and `createLcuClient`.
- Renderer saves `{ autoAcceptReadyCheck }` via existing `updateSettings`.

- [ ] Add a failing UI test that the toggle loads unchecked, saves `true`, and reflects the returned settings.
- [ ] Reuse one `SettingsService` instance for IPC and the acceptor; start after database migration and dispose in `before-quit`.
- [ ] Add the “自动接受匹配” checkbox to the live-page settings aside and implement its update callback.
- [ ] Run `pnpm --dir apps/desktop test`, `pnpm --dir apps/desktop typecheck`, and Electron E2E tests.
- [ ] Build the portable app; do not claim real ReadyCheck acceptance until a real matchmaking prompt occurs.

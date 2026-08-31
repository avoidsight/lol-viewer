# Match Row Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace personal-match achievement badges with two-team champion compositions and add summoner-spell icons.

**Architecture:** Extend the existing validated match summary at the LCU adapter boundary, preserving optional fields for legacy cache compatibility. Render all new imagery from CommunityDragon and keep the compact responsive row.

**Tech Stack:** TypeScript, Zod, React, Vitest, Testing Library, Electron/Vite.

## Global Constraints

- Existing cached snapshots must remain parseable.
- Team arrays contain at most five champion IDs.
- Missing new metadata renders safe empty slots rather than breaking the page.
- Existing date, duration, item, CS, and gold fields remain visible.

---

### Task 1: Match metadata mapping

**Files:**
- Modify: `apps/desktop/src/shared/domain.ts`
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/src/main/lcu/match-adapter.ts`
- Test: `apps/desktop/src/main/lcu/match-adapter.test.ts`
- Test: `apps/desktop/src/shared/ipc.test.ts`

**Interfaces:**
- Produces: `summonerSpellIds?: [number, number]`, `allyChampionIds?: number[]`, `enemyChampionIds?: number[]`.

- [ ] Write failing adapter and schema tests for spell IDs and 5v5 team separation.
- [ ] Run both tests and verify failures are caused by missing fields.
- [ ] Add optional domain/schema fields and map participant metadata.
- [ ] Run both tests and verify they pass.

### Task 2: Compact match-row rendering

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/history/PersonalHistoryPage.tsx`
- Modify: `apps/desktop/src/renderer/src/features/history/personal-history.css`
- Test: `apps/desktop/src/renderer/src/features/history/PersonalHistoryPage.test.tsx`

**Interfaces:**
- Consumes: the optional metadata produced by Task 1.

- [ ] Write a failing page test for two spell icons, two five-icon team rows, local champion highlighting, and absent achievement badges.
- [ ] Run the page test and verify the expected failure.
- [ ] Add CommunityDragon spell URLs, team rows, empty-slot fallback, and responsive styles.
- [ ] Run the page test and verify it passes.

### Task 3: Verification and portable build

**Files:**
- Build output: `apps/desktop/dist/lol-viewer-0.0.0-windows-x64-portable-v3.zip`
- Build output: `apps/desktop/dist/lol-viewer-0.0.0-windows-x64-portable-v3/`

- [ ] Run the complete Vitest suite and TypeScript typecheck.
- [ ] Rebuild Electron native dependencies and production bundles.
- [ ] Run the Electron SQLite smoke test.
- [ ] Generate and extract the v3 portable package.
- [ ] Verify ZIP readability, PE `MZ` header, and packaged ASAR hash.

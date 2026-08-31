# Match Performance Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show 3×2 equipment and team-relative damage, damage-taken, and gold metrics in every personal-history row.

**Architecture:** The match adapter calculates ratios from the already-enriched full game detail and stores them on `MatchSummary`. The renderer presents those values with bundled image assets and a compact three-row layout.

**Tech Stack:** TypeScript, React, CSS, Zod, Vitest, Electron

## Global Constraints

- Percentages use the local participant's team total.
- Missing or zero totals do not produce a ratio.
- The equipment grid shows all six build slots in three columns.

---

### Task 1: Add team-relative metrics

**Files:**
- Modify: `apps/desktop/src/shared/domain.ts`
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/src/main/lcu/match-adapter.ts`
- Test: `apps/desktop/src/main/lcu/match-adapter.test.ts`
- Test: `apps/desktop/src/shared/ipc.test.ts`

- [ ] Add failing assertions for damage, damage-taken, and gold ratios.
- [ ] Calculate each ratio from participants sharing the local `teamId`.
- [ ] Add optional ratio fields to the domain and IPC schema.
- [ ] Run adapter and IPC tests.

### Task 2: Render icons and 3×2 equipment

**Files:**
- Create: `apps/desktop/src/renderer/src/assets/match-damage.png`
- Create: `apps/desktop/src/renderer/src/assets/match-damage-taken.png`
- Create: `apps/desktop/src/renderer/src/assets/match-gold.png`
- Modify: `apps/desktop/src/renderer/src/features/history/PersonalHistoryPage.tsx`
- Modify: `apps/desktop/src/renderer/src/features/history/personal-history.css`
- Test: `apps/desktop/src/renderer/src/features/history/PersonalHistoryPage.test.tsx`

- [ ] Add failing render assertions for the three metrics.
- [ ] Copy the supplied icon assets into the renderer.
- [ ] Replace CS/economy text with three compact metric rows.
- [ ] Change equipment grid to three columns and remove medium-width item hiding.
- [ ] Run renderer tests.

### Task 3: Verify and package

- [ ] Run the complete test suite and typecheck.
- [ ] Build and package the Electron application.
- [ ] Run SQLite smoke verification.
- [ ] Create and extract the v8 portable ZIP and verify executable/ASAR integrity.

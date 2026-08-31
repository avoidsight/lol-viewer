# Personal History Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved compact personal-history dashboard with favorite-champion average K/D/A, rich match details, and icon-only full-game achievement badges.

**Architecture:** Extend the shared optional match fields at the LCU adapter boundary, aggregate champion averages in `PersonalHistoryService`, and render optional data defensively in focused React components. Existing cached snapshots remain valid because new per-match fields are optional.

**Tech Stack:** TypeScript, Zod, React 19, Vitest, Testing Library, Electron Vite, CSS.

## Global Constraints

- Preserve the current cold-blue palette.
- Show at most 20 matches and 5 favorite champions.
- Full-game achievements compare all participants and include ties.
- Achievement badges are icon-only with hover/focus tooltips and `aria-label`.
- Missing optional LCU stats must hide cleanly without failing the snapshot.
- Preserve all unrelated existing worktree changes.

---

### Task 1: Rich Match Domain and Adapter

**Files:**
- Modify: `apps/desktop/src/shared/domain.ts`
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/src/shared/ipc.test.ts`
- Modify: `apps/desktop/src/main/lcu/match-adapter.ts`
- Modify: `apps/desktop/src/main/lcu/match-adapter.test.ts`

**Interfaces:**
- Produces: optional `MatchSummary.itemIds`, `goldEarned`, `totalDamageDealtToChampions`, `totalDamageTaken`, and `achievements`.
- Produces: `MatchAchievement` with `type: 'MOST_KILLS' | 'MOST_ASSISTS' | 'MOST_DAMAGE' | 'MOST_DAMAGE_TAKEN'` and numeric `value`.

- [ ] Write failing adapter tests that include ten participants, ties, item slots, gold, damage, and damage taken.
- [ ] Run `pnpm --filter @lol-viewer/desktop test -- src/main/lcu/match-adapter.test.ts src/shared/ipc.test.ts` and confirm failures are caused by missing rich fields.
- [ ] Extend domain types and strict Zod schemas with optional rich fields.
- [ ] Extend the participant schema and map local participant optional stats.
- [ ] Compute a badge when the local value equals the maximum participant value; ignore a metric when the local value is absent.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Favorite Champion Average K/D/A

**Files:**
- Modify: `apps/desktop/src/shared/domain.ts`
- Modify: `apps/desktop/src/shared/ipc.ts`
- Modify: `apps/desktop/src/main/history/personal-history-service.ts`
- Modify: `apps/desktop/src/main/history/personal-history-service.test.ts`

**Interfaces:**
- Produces: `FavoriteChampion.averageKills`, `averageDeaths`, and `averageAssists`.

- [ ] Add a failing service assertion for per-champion average kills, deaths, and assists.
- [ ] Run the focused service test and verify the assertion fails.
- [ ] Accumulate K/D/A totals per champion and divide by champion game count.
- [ ] Update the strict schema and test fixtures.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Dashboard Renderer

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/history/PersonalHistoryPage.tsx`
- Modify: `apps/desktop/src/renderer/src/features/history/PersonalHistoryPage.test.tsx`
- Modify: `apps/desktop/src/renderer/src/features/history/personal-history.css`
- Modify: `apps/desktop/src/shared/queue.ts`
- Modify: `apps/desktop/src/main/lcu/match-adapter.test.ts`

**Interfaces:**
- Consumes: rich `MatchSummary` and favorite champion averages from Tasks 1 and 2.
- Produces: responsive 28/72 dashboard UI with reusable internal `AchievementBadge` and `MatchRow` components.

- [ ] Replace corrupted test expectations with correct Chinese and add failing assertions for averages, item images, economy, time, and accessible achievement icons.
- [ ] Run the renderer and queue tests and verify they fail for missing UI/correct Chinese.
- [ ] Correct queue and personal-history Chinese copy.
- [ ] Implement average K/D/A, item images, KDA ratio, economy, formatted time, and icon-only SVG badges.
- [ ] Rewrite CSS to match the approved compact overview and 28/72 side-by-side layout, including hover/focus tooltips and responsive fallbacks.
- [ ] Run focused renderer tests and confirm they pass.

### Task 4: Compatibility and Full Verification

**Files:**
- Modify test fixtures that construct `FavoriteChampion` only where required by strict typing.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: a verified build without regressions.

- [ ] Run `pnpm --filter @lol-viewer/desktop test`.
- [ ] Fix only failures caused by the new optional fields or corrected copy, rerunning the smallest failing test first.
- [ ] Run `pnpm --filter @lol-viewer/desktop typecheck`.
- [ ] Run `pnpm --filter @lol-viewer/desktop build`.
- [ ] Inspect `git diff --check` and confirm no whitespace errors.

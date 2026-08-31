# Hide Trinket Slot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the personal match-history equipment list from showing the LCU trinket slot.

**Architecture:** Keep the existing item-ID filtering, but stop collecting `participant.stats.item6` in the match adapter. This removes all current and future trinket variants without changing renderer behavior.

**Tech Stack:** TypeScript, Zod, Vitest, Electron

## Global Constraints

- Read only `item0` through `item5` into `MatchSummary.itemIds`.
- Preserve the existing non-build-item ID filter and item order.

---

### Task 1: Exclude the trinket slot

**Files:**
- Modify: `apps/desktop/src/main/lcu/match-adapter.ts`
- Test: `apps/desktop/src/main/lcu/match-adapter.test.ts`

**Interfaces:**
- Consumes: LCU participant stats fields `item0` through `item6`.
- Produces: `MatchSummary.itemIds` containing build items from `item0` through `item5` only.

- [ ] **Step 1: Write the failing test**

Set `item6` to a normal build item ID such as `3078`, then assert the adapted `itemIds` do not contain `3078`.

- [ ] **Step 2: Run test to verify it fails**

Run:
`node node_modules/vitest/vitest.mjs run --configLoader runner src/main/lcu/match-adapter.test.ts`

Expected: the equipment assertion fails because `item6` is currently collected.

- [ ] **Step 3: Write minimal implementation**

Remove `participant.stats.item6` from the array used to build `itemIds`. Keep `isBuildItem` filtering unchanged.

- [ ] **Step 4: Verify**

Run the focused adapter test, then the complete test suite, typecheck, production build, Electron packaging, and SQLite smoke test.

- [ ] **Step 5: Package**

Create and extract `lol-viewer-0.0.0-windows-x64-portable-v7.zip`, then verify the executable header and packaged ASAR hash.

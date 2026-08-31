# Live Match Roster MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a compact two-row 5v5 live roster that remains useful when histories are private, and add a safe manual refresh button to personal history.

**Architecture:** Keep API ownership in `App`; pass refresh state and callbacks into `PersonalHistoryPage`. Keep team ordering in `LiveMatchPage`; make `PlayerCard` render either a compact history summary or a compact privacy state without reserving an empty ten-match list.

**Tech Stack:** React 19, TypeScript, CSS, Testing Library, Vitest, Electron/Vite.

## Global Constraints

- Preserve the existing LCU and IPC schemas.
- Never infer a local team when `localTeamId` is `null`.
- Use position sorting only when `positionOrderReliable` is true; otherwise preserve roster order.
- Keep ten cards visible in two aligned rows and use horizontal scrolling below the desktop minimum width.
- A failed manual history refresh must preserve the previously rendered snapshot.

---

### Task 1: Personal History Manual Refresh

**Files:**
- Modify: `apps/desktop/src/renderer/src/App.tsx`
- Modify: `apps/desktop/src/renderer/src/App.test.tsx`
- Modify: `apps/desktop/src/renderer/src/features/history/PersonalHistoryPage.tsx`
- Modify: `apps/desktop/src/renderer/src/features/history/PersonalHistoryPage.test.tsx`
- Modify: `apps/desktop/src/renderer/src/features/history/personal-history.css`

**Interfaces:**
- `PersonalHistoryPage` consumes `onRefresh?: () => void`, `refreshing?: boolean`, and `refreshError?: string`.
- `App` continues consuming `LolViewerApi.getPersonalHistory(): Promise<PersonalHistorySnapshot>`.

- [ ] **Step 1: Write failing interaction tests**

Add tests that click `刷新`, observe `刷新中`, resolve a second `getPersonalHistory` call, and verify the new player summary. Add a rejection case asserting that old data remains visible and `刷新失败，请重试` appears.

```tsx
fireEvent.click(screen.getByRole('button', { name: '刷新' }));
expect(screen.getByRole('button', { name: '刷新中' })).toBeDisabled();
await act(async () => refresh.resolve({ ...history, wins: 9 }));
expect(screen.getByText('9')).toBeVisible();
```

- [ ] **Step 2: Run tests and verify RED**

Run: `vitest run src/renderer/src/App.test.tsx src/renderer/src/features/history/PersonalHistoryPage.test.tsx`

Expected: FAIL because no refresh button or refresh props exist.

- [ ] **Step 3: Implement refresh state and presentation**

In `App`, create `historyRefreshing` and `historyRefreshError`. A manual refresh calls `getPersonalHistory` directly, updates the snapshot only on success, preserves it on rejection, and always clears the pending state.

```tsx
const refreshHistory = async () => {
  if (historyRefreshing || !window.lolViewer) return;
  setHistoryRefreshing(true);
  setHistoryRefreshError('');
  try { setHistory(await window.lolViewer.getPersonalHistory()); }
  catch { setHistoryRefreshError('刷新失败，请重试'); }
  finally { setHistoryRefreshing(false); }
};
```

Render the button in the history hero with a minimum 44px hit target and an adjacent `aria-live="polite"` error message.

- [ ] **Step 4: Run tests and verify GREEN**

Run the same focused Vitest command. Expected: PASS.

### Task 2: Compact Private-History Player Card

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/live/PlayerCard.tsx`
- Modify: `apps/desktop/src/renderer/src/features/live/LiveMatchPage.test.tsx`
- Modify: `apps/desktop/src/renderer/src/features/live/live-match.css`

**Interfaces:**
- `PlayerCard` keeps its current props.
- The card exposes `data-history-state="ready|loading|unavailable"` for stable behavioral testing.

- [ ] **Step 1: Write failing card-state tests**

Render ten unavailable players and assert ten compact privacy messages, no recent-match rows, and card heights below the old 388px minimum.

```tsx
expect(screen.getAllByText('战绩受国服隐私保护')).toHaveLength(10);
expect(screen.queryByTestId('recent-match')).not.toBeInTheDocument();
expect(screen.getAllByTestId('player-card')[0]).toHaveAttribute('data-history-state', 'unavailable');
```

- [ ] **Step 2: Run the live-page test and verify RED**

Run: `vitest run src/renderer/src/features/live/LiveMatchPage.test.tsx`

Expected: FAIL because the current unavailable state uses a tall generic placeholder.

- [ ] **Step 3: Implement compact card states**

Keep player name, lane/roster label, rank, and champion identity visible. For unavailable history, render one compact status row. For ready history, show sample size, win rate, KDA-derived match list, limited to the available matches.

- [ ] **Step 4: Run the live-page test and verify GREEN**

Run the same focused test. Expected: PASS.

### Task 3: Two-Row 5v5 Roster Layout

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/live/LiveMatchPage.tsx`
- Modify: `apps/desktop/src/renderer/src/features/live/LiveMatchPage.test.tsx`
- Modify: `apps/desktop/src/renderer/src/features/live/live-match.css`

**Interfaces:**
- `teamSlots(players, reliable)` remains the sole ordering function.
- `LiveMatchPage` continues consuming the existing `LiveMatch` and progressive `players` props.

- [ ] **Step 1: Write failing roster-layout tests**

Assert two labeled team headers, five cards per team, compact `data-testid="team-roster"` rows, neutral labels when orientation is unknown, and client order for unreliable positions.

```tsx
expect(screen.getAllByTestId('team-roster')).toHaveLength(2);
expect(within(screen.getAllByTestId('team-roster')[0]).getAllByTestId('player-card')).toHaveLength(5);
```

- [ ] **Step 2: Run test and verify RED**

Run the focused live-page test. Expected: FAIL because the new roster containers and headers do not exist.

- [ ] **Step 3: Implement the roster shell and responsive CSS**

Use a toolbar status strip, two aligned five-column rows, semantic team headings, a subtle versus divider, compact 8–12px gaps, and a horizontal scroll container at widths below the roster minimum.

- [ ] **Step 4: Run test and verify GREEN**

Run the focused live-page test. Expected: PASS.

### Task 4: Verification and Windows Portable Package

**Files:**
- Verify all modified renderer files.
- Create: `apps/desktop/dist/lol-viewer-0.0.0-windows-x64-portable-v14.zip`

- [ ] **Step 1: Run full verification**

Run the Node-native rebuild, all Vitest tests, `tsc --noEmit`, and `electron-vite build`.

- [ ] **Step 2: Rebuild native module for Electron**

Run: `electron-rebuild -f -w better-sqlite3`

- [ ] **Step 3: Package and smoke test**

Run Electron Builder in directory mode, run `electron scripts/sqlite-smoke.cjs`, copy `win-unpacked` to the v14 portable folder, compress it, and verify the ZIP contains `LOL Viewer.exe`, `resources/app.asar`, and `better_sqlite3.node`.

# Task 7 Report — Lazy, Cancellable Tab Loading

## Result

- The default history tab owns and caches the personal-history request; startup never requests live data.
- Entering the live tab subscribes before calling `getLiveMatch('all', generation)`.
- Leaving live marks the session inactive, unsubscribes, and calls `cancelLiveMatch`; re-entry creates a newer generation.
- Progressive events and promise results from inactive/older sessions cannot update the current page.
- A pending coordinator is rendered as `等待进入英雄选择或游戏`, with no player grid until progress or a match exists. Only a rejected request becomes the retryable alert.
- Queue-scope controls and settings-driven live auto-open were removed. The resolved `match.modeName` is shown beside the page title.
- Recent match rows include the shared queue label while retaining the ten-row layout.
- The champion-guide callback remains stable.

## TDD Evidence

- The first attempted RED command failed before Vitest because the shell did not contain the bundled Node directory (`node is not recognized`). This was an environment failure and is not counted as RED evidence.
- After adding the workspace Node prefix, the real RED run completed: `App.test.tsx` had 5 expected lifecycle failures (wrong `ranked-solo` scope, absent honest waiting text, premature placeholder slots, missing cancellation/generation behavior, and absent mode display).
- GREEN: `pnpm --filter @lol-viewer/desktop test -- src/renderer/src/App.test.tsx src/renderer/src/features/live/LiveMatchPage.test.tsx src/renderer/src/features/history/PersonalHistoryPage.test.tsx` ran the desktop suite and passed 24 files / 147 tests.

## Files

- `apps/desktop/src/renderer/src/App.tsx`
- `apps/desktop/src/renderer/src/App.test.tsx`
- `apps/desktop/src/renderer/src/features/live/LiveMatchPage.tsx`
- `apps/desktop/src/renderer/src/features/live/LiveMatchPage.test.tsx`
- `apps/desktop/src/renderer/src/features/live/RecentMatch.tsx`
- `apps/desktop/src/renderer/src/features/live/live-match.css`

## Verification

- Desktop tests: 24 files / 147 tests passed.
- Typecheck: `tsc --noEmit` passed.
- `git diff --check`: clean apart from Git's informational LF-to-CRLF warnings.
- Commit: the Task 7 commit containing this report (`feat: load tab data on demand`).

## Self-check and Concerns

- Confirmed `outputs/` remains untracked and untouched.
- Confirmed Task 5's neutral progressive lineup behavior and Task 6's stable champion-guide callback remain covered by passing tests.
- No functional concerns. Test invocation after `--` currently runs the complete Vitest project rather than only the named renderer files; this provides broader verification but makes the “focused” command slower.

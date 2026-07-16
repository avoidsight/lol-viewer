# Task 4 Report

## Status

Implemented concurrent live-match player loading with partial-success streaming, validated IPC, and a narrow preload API.

## RED evidence

- Command: `pnpm --filter @lol-viewer/desktop test -- match-service.test.ts` (with the bundled Node directory added to `PATH` because the fallback pnpm wrapper did not expose `node`).
- Result: failed as expected because `./match-service` could not be resolved from `match-service.test.ts`.

## GREEN evidence

- Focused: `vitest run src/main/match/match-service.test.ts src/main/ipc/register-match-ipc.test.ts --configLoader runner`
  - 2 files passed, 4 tests passed.
- Full desktop tests: `vitest run --configLoader runner`
  - 6 files passed, 23 tests passed.
- Typecheck: `tsc --noEmit`
  - Exit code 0.
- Production build: `electron-vite build`
  - Main, preload, and renderer bundles built successfully. The sandboxed attempt could not traverse the dependency/config path; the approved unrestricted rerun passed.
- IPC security scan: `rg electron apps/desktop/src/renderer -n`
  - No matches; renderer code does not import Electron.

## Implemented behavior

- Loads ten session participants with at most four history requests in flight.
- Retries only transient `LCU_UNAVAILABLE` failures twice, after 250 ms and 750 ms.
- Converts each completed history to a ready snapshot and emits it immediately.
- Converts an individual exhausted/non-transient history failure to an unavailable snapshot without rejecting the whole match.
- Requires Zod schemas for both LCU calls.
- Parses IPC scope with `z.enum(['ranked-solo', 'all'])` in the main process.
- Exposes only `getLiveMatch(scope)` and `onPlayerUpdated(listener)` through the preload bridge; the latter returns an unsubscribe function.

## Self-review

- No raw `ipcRenderer` object crosses the context bridge.
- Player errors are generic and do not expose response bodies or credentials.
- Result ordering follows session ordering even though player updates stream in completion order.
- No Task 5+ UI work was included.

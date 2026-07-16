# Task 5 report

## Status

Implemented the renderer's accessible live-match comparison page as a fixed 2×5 layout. The local team is rendered first and both rows use the fixed TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY order. The grid has a 1050px minimum width and a keyboard-focusable horizontal scroll container.

Each ready player card displays only supplied fields: player, lane, rank, sample size, win rate, current-champion sample, and up to ten recent matches. Each match has a CommunityDragon champion image URL, an on-error numeric text fallback, literal 胜/负 text, and literal K/D/A. Loading, unavailable, and fewer-than-ten states are explicit. No composite score was added.

`App` now requests the selected queue scope through the existing frozen preload API and renders the page after a validated `LiveMatch` is returned. IPC contracts and Electron security settings were not changed.

## RED evidence

Command:

`pnpm --filter @lol-viewer/desktop test -- LiveMatchPage.test.tsx`

After adding the UI test first, Vitest exited 1 with:

`Failed to resolve import "./LiveMatchPage" ... Does the file exist?`

The other 27 tests passed during this RED run. The first attempt was blocked before Vitest because the managed runtime's Node directory was absent from PATH; rerunning with that directory prepended produced the valid failure above.

## GREEN evidence

Focused command (the current Vitest configuration also runs the complete desktop suite):

`pnpm --filter @lol-viewer/desktop test -- LiveMatchPage.test.tsx`

Result: exit 0; 8 test files passed, 31 tests passed. The four new UI tests cover ten cards/100 matches, fixed lane alignment, textual win/loss and image alternatives, loading/unavailable/short-history states, and accessible scope controls.

Additional verification:

- `pnpm --filter @lol-viewer/desktop typecheck` — exit 0.
- `pnpm --filter @lol-viewer/desktop build` — exit 0; main, preload, and renderer bundles produced. The sandboxed attempt could not read esbuild's ancestor path, so the identical build was rerun with approved filesystem access.
- `git diff --check` — no whitespace errors (Git only reported expected LF-to-CRLF checkout warnings).

## Self-review

- Scope remains renderer-only except for the required `App` mount; no Task 6+ guide or scoring feature was added.
- Cards use semantic headings, lists, definitions, explicit status text, button pressed states, image alternatives, and keyboard-visible focus.
- Win/loss remains distinguishable by the literal 胜/负 labels, independent of color.
- Shared domain, IPC schemas, preload validation, and BrowserWindow security were preserved.

## Concerns

- Champion images require network availability; each URL is pinned to a separately validated current client asset version and the numeric champion-ID fallback remains visible when a version or image is unavailable.
- Standard LCU team IDs 100 and 200 anchor progressive rows so out-of-order updates do not move enemy cards into the local row; non-standard team IDs retain deterministic first-seen ordering.

## Reviewer follow-up

### Root causes

- `App` used one scope value for both the requested and displayed data and replaced every failed request with the same empty waiting view.
- It invoked `getLiveMatch` without subscribing to the validated progressive player stream.
- Lane rendering filtered by five lane values, so valid UNKNOWN players and duplicate lane assignments were dropped.
- Recent-match icons used CommunityDragon's mutable `latest` alias because `MatchSummary` did not retain the validated LCU game version.

### Follow-up RED evidence

After adding integration and regression tests first, the focused command
`pnpm --filter @lol-viewer/desktop test -- App.test.tsx LiveMatchPage.test.tsx match-adapter.test.ts`
failed with 8 expected failures: missing loading/error states, request occurring before subscription, no progressive player visibility, stale scope relabeling, missing game version validation/data, a mutable `/latest/` image URL, and only four cards per team for duplicate/UNKNOWN lanes.

### Follow-up GREEN evidence

The same focused command then exited 0 with 8 files and 37 tests passing. Added coverage verifies:

- initial ten-slot loading UI and always-available queue controls;
- subscribe-before-request ordering, progressive player display, and cleanup unsubscribe;
- distinct requested/displayed scopes, including retained old data and explicit error after a failed scope transition;
- exactly five deterministic slots per team without dropped identities, plus visible uncertainty labels;
- version-specific CommunityDragon URLs without `/latest/`;
- controlled scope rerender behavior and directly inspectable `min-width: 1050px` / `overflow-x: auto` invariants.

Final verification:

- `pnpm --filter @lol-viewer/desktop test` — exit 0; 8 test files, 37 tests passed.
- `pnpm --filter @lol-viewer/desktop typecheck` — exit 0.
- `pnpm --filter @lol-viewer/desktop build` — exit 0; main, preload, and renderer production bundles generated.

## Final asset-version correction

The prior follow-up incorrectly modeled a mandatory `gameVersion` inside the match-history envelope. The actual history adapter and fixture now contain no invented version requirement. `MatchService` obtains the current static-asset version independently from `/lol-patch/v1/game-version`, validates the response, and propagates it as optional `PlayerSnapshot.assetVersion` rather than historical match data.

### RED evidence

The focused command `pnpm --filter @lol-viewer/desktop test -- match-adapter.test.ts match-service.test.ts LiveMatchPage.test.tsx` exited 1 with 10 expected failures. Evidence included history rejection at the nonexistent `gameVersion` path, missing `assetVersion` propagation, `/undefined/` image URLs, and unwanted image elements when no version existed.

### GREEN evidence

After the correction, the focused command exited 0 with 8 files and 41 tests passing. New assertions prove that a real `{ games: [...] }` history envelope succeeds, a validated current version reaches every player and the versioned image URL, version lookup errors or invalid response shapes do not suppress history, absent versions render numeric fallbacks without creating image requests, and an image load error preserves the numeric fallback.

Final verification also passed: full desktop Vitest 8 files/41 tests, `tsc --noEmit`, and all main/preload/renderer production builds exited 0.

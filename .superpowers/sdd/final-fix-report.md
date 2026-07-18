# Desktop final fix report

## Status

Implemented the final-review fix wave across the main process, LCU adapter, IPC/preload boundary, renderer, settings, and champion-guide client. The champion cloud server was not implemented. No overlay or client injection was introduced.

## RED evidence

The first focused run was:

`pnpm --filter @lol-viewer/desktop test -- http-client.test.ts match-service.test.ts gameflow-coordinator.test.ts`

After restoring the existing offline dependencies and supplying the bundled Node runtime on `PATH`, Vitest exited 1 with the expected missing behavior:

- response-size test returned the oversized body instead of `LCU_RESPONSE_TOO_LARGE`;
- team 200 remained second despite the current summoner belonging to it;
- solo rank was absent;
- `gameflow-coordinator.ts` did not exist.

The RED run reported 3 failed assertions and one failed suite (missing coordinator module); 87 existing tests passed.

Additional boundary tests were then updated/added for generation-tagged progress, persisted settings, cache-clear feedback, dynamic guide patches, explicit retry, and teardown.

## GREEN implementation

- Added a bounded two-second recovery coordinator. It retries startup-before-client/session failures, offers an immediate explicit retry, and clears pending timers on teardown.
- Resolves and validates the current summoner, orients the participant array with the local team first (including team 200), and rejects sessions where the resolved identity is absent. A validated-session first-team fallback is retained for older clients lacking the identity endpoint.
- Fetches validated `RANKED_SOLO_5x5` tier/division/LP independently per player. Rank failure does not affect history or other players.
- Added strict generation-tagged match requests/player events. The renderer merges current-generation player snapshots into the visible match and rejects prior-generation events.
- Loads persisted settings before automatic match loading; `queueScope`, `autoOpenLiveMatch`, and `showLaneDifferences` alter behavior. Added retry, settings, status, and cache-clear controls with success/error feedback.
- Champion guide patch now comes from the validated current client version for every request/cache key. `CHAMPION_GUIDE_PATCH` remains an explicit override.
- Added a 2 MiB default LCU body ceiling with an injectable test limit and sanitized `LCU_RESPONSE_TOO_LARGE` error.
- Preserved context isolation, sandboxing, authorized IPC, loopback-only LCU transport, and schema validation at LCU/IPC/cache boundaries. No token or player-history data is sent to the champion guide service.

## Verification

- Focused/full unit GREEN: 18 files, 94 tests passed.
- Typecheck: `tsc --noEmit`, exit 0.
- Electron E2E: exact 10 cards and 100 match records, 1 test passed in 1.1 seconds (under 15 seconds).
- Electron 37 native rebuild: `better-sqlite3` rebuild completed.
- Electron 37 native smoke: `better-sqlite3 Electron smoke passed: value=42`.
- Production build: main, preload, and renderer bundles built successfully with Electron Vite.
- `git diff --check`: no whitespace errors (only Windows LF/CRLF notices).
- Renderer/preload secret scan found no password, Authorization, token, or match-history transport references.

The first sandboxed Electron build could not traverse an ancestor dependency path, and the first sandboxed Electron native smoke crashed with the Windows access-violation code. The identical commands succeeded outside that filesystem/process restriction.

## Real-client smoke

Real CN LCU smoke: **NOT RUN**. No consenting user with an open League client was confirmed. No claim about real-client behavior is made.

## Concerns and self-review

- Recovery is intentionally polling-based rather than websocket-based; the two-second interval stays well inside the 15-second requirement and is disposed during app teardown.
- The rank endpoint can vary between client releases; failures are deliberately isolated and surface as an unknown rank.
- The current-summoner endpoint is preferred. The compatibility fallback uses only the already schema-validated session ordering when that endpoint is unavailable.
- Guide calls contain only patch, champion ID, and lane; they never contain LCU credentials, summoner identity, or match history.

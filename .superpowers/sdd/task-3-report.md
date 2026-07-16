# Task 3 Report: Discover and connect to the local League client

## Scope

Implemented only LCU connection discovery and the loopback HTTPS GET client:

- `apps/desktop/src/main/lcu/discovery.ts`
- `apps/desktop/src/main/lcu/http-client.ts`
- focused tests for both modules

No renderer IPC, persistence, match-fetching workflow, or Task 4+ behavior was added. The pnpm lifecycle allowlist and package manifests were unchanged.

## RED evidence

Command (with the bundled Node directory prepended to `PATH`, because the initial shell PATH could launch pnpm but not its Node child process):

```powershell
pnpm --filter @lol-viewer/desktop test -- discovery.test.ts http-client.test.ts
```

Result: exit 1. Both new suites failed for the intended reason:

```text
FAIL src/main/lcu/discovery.test.ts
Failed to resolve import "./discovery"

FAIL src/main/lcu/http-client.test.ts
Failed to resolve import "./http-client"
```

The existing two suites and 8 existing tests passed during RED.

## GREEN implementation

Discovery:

- inspects a supplied process list or discovers `LeagueClientUx.exe` on Windows;
- parses `--app-port` and `--remoting-auth-token` without logging either command line or token;
- prefers the process command line, then reads `LCU_LOCKFILE_PATH` when configured;
- otherwise checks conventional Riot Games lockfile locations;
- accepts only valid HTTPS lockfile records and valid TCP port numbers.

HTTP client:

- always connects to `https://127.0.0.1:<port>` and accepts only origin-relative paths;
- sends Basic authentication for `riot:<token>`;
- uses a 5,000 ms timeout and the LCU self-signed TLS endpoint;
- maps transport failures/timeouts, authentication failures, and invalid responses to typed `LcuError` codes;
- constructs sanitized errors without request options, credentials, token-bearing causes, or response bodies.

Dependency injection is limited to the HTTPS request transport; tests never require a running League client.

## GREEN evidence

Focused command:

```powershell
pnpm --filter @lol-viewer/desktop test -- discovery.test.ts http-client.test.ts
pnpm --filter @lol-viewer/desktop typecheck
```

Result: exit 0; 4 files passed, 17 tests passed, and `tsc --noEmit` passed. (Vitest's current script also collected the two existing suites.)

Fresh full verification before commit:

```powershell
pnpm --filter @lol-viewer/desktop test
pnpm --filter @lol-viewer/desktop typecheck
```

Result: exit 0.

```text
Test Files  4 passed (4)
Tests       17 passed (17)
tsc --noEmit
```

## Self-review

- Token-redaction is asserted for console calls and both string/JSON error serialization.
- No production logging was introduced.
- Host selection is not caller-controlled; it is fixed to IPv4 loopback.
- Absolute and protocol-relative request targets are rejected before transport invocation.
- Lockfile/process parse failures degrade to `null` without exposing their raw contents.

## Concerns

- Automatic process enumeration is Windows-specific, matching the desktop target. Tests cover injected process data and do not invoke PowerShell.
- `LCU_LOCKFILE_PATH` is the configuration mechanism for non-standard installations.

## Follow-up: schema-enforced responses and reviewer findings

The global constraint was resolved in favor of requiring every parsed LCU response to pass a caller-provided Zod schema. The client API is now:

```ts
get<T>(path: string, schema: z.ZodType<T>): Promise<T>
```

There is no schema-free overload, so parsed JSON cannot leave the client without validation. JSON syntax failures and Zod validation failures both produce a sanitized `LCU_INVALID_RESPONSE`; neither raw response bodies nor authentication tokens are attached to the error.

### Follow-up RED

After changing the tests to require schemas, the focused command exited 1 with the new schema-mismatch test receiving the unvalidated response object instead of `LCU_INVALID_RESPONSE`:

```text
FAIL rejects valid JSON that does not match the caller schema without exposing the body
expected { phase: 'secret-response-value' } to match object { code: 'LCU_INVALID_RESPONSE' }
```

The other 18 tests passed in this RED run.

### Follow-up fixes

- Added mandatory generic Zod validation via `safeParse` before resolving client responses.
- Added a transport test that emits `timeout`, verifies `request.destroy()` is called exactly once, and verifies the returned `LCU_UNAVAILABLE` serializes without the token.
- Added schema-failure assertions verifying neither a sensitive response value nor the authentication token leaks through string/JSON error serialization.
- Changed temporary lockfile cleanup to an async `afterEach` registry, so cleanup runs even when an assertion fails.

### Follow-up verification

Fresh verification:

```text
pnpm --filter @lol-viewer/desktop test
Test Files  4 passed (4)
Tests       19 passed (19)

pnpm --filter @lol-viewer/desktop typecheck
tsc --noEmit (exit 0)

pnpm --filter @lol-viewer/desktop build
main, preload, and renderer bundles built (exit 0)
```

The first sandboxed build attempt could not traverse to the Electron Vite config because of filesystem restrictions. Re-running the same build with the required read permission succeeded; this was an execution-environment restriction rather than a source failure.

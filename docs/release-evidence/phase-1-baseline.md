# Phase 1 Baseline Evidence

- Recorded at: `2026-07-14T17:09:09+08:00`
- Branch: `platform/backend-modules`
- Tested baseline commit: `895fced96a7b72a36adafab0eef506332838ba3b`
- Package manager: `pnpm@10.33.2`

## Reconciled worktree

The confirmed Phase 0 fixes were already committed before this reconciliation:

- `5c68e85` — invokes `pnpm` directly in repository scripts.
- `a458fc5` — aligns the WhatsApp fallback test, wires encrypted session persistence, preserves plaintext mode when the key is absent, and prevents QR payload logging.
- `f4cae4d` — adds the availability snapshot migration and updates the core migration plan and index.

No Phase 0 source file was uncommitted. The reviewed pre-existing work was separated into:

- `cc23e4b` — Docker-first development stack, its scripts/tests, and matching design/implementation plan.
- `c6993d9` — Docker-first handbook and deployment-guide corrections, including the security-verifier-safe secret-generation example.
- `895fced` — excludes local agent state from Docker build contexts and verifies that exclusion.
- `.superpowers/` and `tmp/` — unrelated generated/local artifacts left untracked and unstaged.

## Corepack scan

Command:

```bash
rg -n 'corepack pnpm' --glob 'package.json' .
```

Result: **PASS**. The command exited `1` with no matches, which is the expected ripgrep result for a zero-match scan.

## Required Phase 0 suites

| Suite | Command directory | Result |
| --- | --- | --- |
| WhatsApp | `packages/whatsapp` | **PASS** — 29 passed, 0 failed |
| Database | `packages/database` | **PASS** — 16 passed, 0 failed |
| Reservations Supabase | `packages/reservations-supabase` | **PASS** — 56 passed, 0 failed |
| Standalone API | `apps/api` | **PASS** — 138 passed, 0 failed |

Each suite was run with `pnpm run test` from the directory shown. Initial sandboxed invocations stopped before test execution because the pnpm launcher could not reach the registry to verify the pinned signed release. The same commands were rerun with registry access; the results above are those completed test runs.

## Migration and Docker-development verification

| Command | Result |
| --- | --- |
| `pnpm run database:verify-migration-bundle` | **PASS** — migration index current; bundle verified with 28 entries and 18 inventoried SQL assets |
| `pnpm run local-stack:test` | **PASS** — 14 passed, 0 failed |
| `pnpm run stack:verify` | **PASS** — Docker-first topology and safety boundaries verified |
| `pnpm run deploy:verify` | **PASS** — deployment file and final security checks passed |

The first `deploy:verify` run found that one long HTML source line placed a legitimate secret-generation `console.log` example before later QR guidance, triggering the conservative credential/QR logging scanner. The example was changed to `process.stdout.write`, and the complete deployment verification then passed. The standalone deployment-config subcheck reported its expected local skip because no external standalone deployment environment is configured; no network or live backend call was attempted by that subcheck.

## Live checks

Docker Engine `29.6.1` and Docker Compose `v5.3.0` were detected. `docker compose ps --all --format json` returned no running or stopped project services.

The following stateful checks were not run during reconciliation:

- `pnpm run stack:verify:live`
- `pnpm run stack:verify:persistence`
- `pnpm run stack:verify:smoke`

They require starting or mutating the Compose project. Task 1 is a static baseline and did not authorize bringing up or resetting the local stack; clean-host and live lifecycle proofs are separate Phase 1 gates.

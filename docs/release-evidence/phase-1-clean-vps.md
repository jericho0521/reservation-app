# Phase 1 clean Ubuntu VPS evidence

## Gate status

**NOT RUN — external infrastructure blocker.**

No disposable supported Ubuntu VPS, unused public domain/DNS record, or published `ghcr.io/jericho0521` release image set was available in this workspace on 2026-07-15. Therefore this document does not claim that HTTPS certificate issuance, public DNS routing, registry pulls, or the clean-VPS setup-page gate passed.

The Phase 1 exit gate remains open until the exact supported installer command is executed on a clean x86-64 Ubuntu 22.04 or 24.04 VPS and the evidence fields below are replaced with observed results.

## Local evidence

Repository: `reservation-app`

Branch: `platform/backend-modules`
Task 6 base commit: `ca02ee5` (`feat(deploy): add production compose topology`)

The following checks were run locally through `2026-07-15T16:36:35+08:00` during Task 7 implementation:

| Check | Result |
| --- | --- |
| Deterministic OS/resource preflight, installer-order/resume/rollback, smoke, retry, redaction, and demo-absence tests | PASS — 15/15 |
| Release-manifest generator/verifier unit tests | PASS — 3/3 |
| Current-candidate release-manifest drift check | PASS |
| Production tools image build and in-image network-disabled/read-only manifest verification | PASS |
| Setup readiness landing and response-header tests | PASS — 3/3 |
| POSIX shell syntax checks, Node syntax check, and whitespace diff check | PASS |
| Console TypeScript check and optimized Next.js build, including `/setup` | PASS |
| Production topology verifier and Compose interpolation/configuration check | PASS |
| Pinned Caddy 2.10.0 production Caddyfile validation | PASS — `Valid configuration` |
| Workflow-to-package-script verifier | PASS |
| Root `pnpm run production:installer:test` wrapper | BLOCKED — Homebrew pnpm 11.10.0 attempted to fetch pinned pnpm 10.33.2, then refused the switch because npm registry signature verification could not fetch the signed packages; every underlying direct preflight, manifest-test, manifest-check, and setup-test command passed above |

Local checks do not substitute for a clean-VPS proof.

## Required clean-VPS record

Record only observed values after the external run:

| Evidence | Status |
| --- | --- |
| Ubuntu release and architecture | NOT RUN |
| VPS provider/instance shape | NOT RUN |
| Installation start/end time and duration | NOT RUN |
| Exact reservation release | NOT RUN |
| API image digest | NOT RUN |
| Worker image digest | NOT RUN |
| Console image digest | NOT RUN |
| Booking image digest | NOT RUN |
| Tools image digest | NOT RUN |
| PostgreSQL/PostgREST/Caddy image digests | NOT RUN |
| Redacted domain | NOT RUN |
| DNS A record matches host | NOT RUN |
| Valid public HTTPS certificate | NOT RUN |
| `/v1/health/live` returns 200 | NOT RUN |
| `/v1/health/ready` returns 200 | NOT RUN |
| `/admin/setup` returns the ready landing page | NOT RUN |
| `/` returns the unpublished setup-safe page | NOT RUN |
| `apex-racing-demo` returns 404 through booking and API routes | NOT RUN |
| PostgreSQL has no published host port | NOT RUN |
| PostgREST has no published host port | NOT RUN |
| Setup token absent from logs and captured evidence | NOT RUN |

The local `release-manifest.json` is deterministic drift evidence only. Published image availability, registry digests, provenance, and release signing remain NOT RUN and belong to the Phase 6 release gate.

## External proof command

From the extracted release bundle on the clean VPS, the operator must run:

```bash
sudo ./scripts/production/install.sh \
  --domain <unused-public-domain> \
  --release 0.1.0 \
  --host-ip <vps-public-ip>
```

Before publishing this evidence, replace the placeholders and `NOT RUN` cells with redacted, observed values; attach bounded service state and smoke output; and verify that no setup URL, secret, customer data, or credential appears in the artifact.

# Phase 4: Clean External Frontend Proof

## Goal

Prove the plug-and-play story from outside this repository: a clean frontend
with no monorepo context can install the SDK package, point at a backend `/v1`
base URL, and complete representative workflows.

## Inputs To Read

- Phase 1 backend product contract from this folder
- Phase 2 SDK installable contract from this folder
- Phase 3 frontend detachment plan from this folder
- `scripts/verify-current-frontend-consumer-repo-readiness.mjs`
- `scripts/verify-sdk-registry-install-proof.mjs`
- `scripts/verify-sdk-live-parity.mjs`
- `package.json`

## Work

1. Create a clean external fixture or generated temp frontend outside the
   monorepo workspace assumptions.
2. Install the SDK from a package artifact or approved registry source, not a
   workspace link.
3. Configure the fixture with a backend base URL and public frontend env only.
4. Prove representative reservation/catalog/admin/chat-disabled flows through
   SDK or direct `/v1` calls.
5. Fail the proof if the fixture imports backend source, current app files,
   workspace aliases, migrations, Supabase service-role helpers, or
   compatibility routes.

## Acceptance Gates

- External fixture install/build proof is reproducible and documented.
- SDK install uses package artifact or registry coordinates, not
  `workspace:*`, `file:`, `link:`, or `portal:` specs.
- The proof can run in safe mode without network by validating configuration,
  and strict mode fails closed until install/network approval is explicitly
  configured.
- SDK/direct HTTP parity proof covers the same backend URL.

## Downstream Update Rule

If external adoption requires new SDK exports, package dependencies, backend
routes, CORS behavior, auth headers, idempotency behavior, or frontend env
names, update Phases 1, 2, 3, 5, and 6 as applicable before reporting done.

## Subagent Notes

This phase is the first true "drop this into any app" proof. A passing monorepo
workspace test is not enough. The fixture must behave like another team started
with only their frontend and the SDK install instructions.

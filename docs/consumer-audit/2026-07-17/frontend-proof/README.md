# Real Frontend End-to-End Proof

## Outcome

The platform was tested from a clean committed snapshot as three real products:

1. the shipped Docker customer booking site;
2. the shipped Docker owner console;
3. a disposable external frontend installed from packed public packages.

The customer journey and external SDK booking both created real database rows.
The customer then used the private management page to cancel. The owner console
successfully edited and published the experience, exercised WhatsApp simulation,
performed staff takeover/reply/resume, and rendered the major operational
surfaces. The run also found four owner-facing failures and one package-consumer
workaround that would be hidden by render-only smoke tests. Generated screenshots
and recordings are retained locally under `tmp/frontend-proof/` and are not
versioned.

Machine-readable classifications are in [results.json](results.json). The
broader API functional matrix remains in the [parent consumer audit](../README.md).

## Environment and Isolation

- Source commit under test: `6793609`
- Compose project: `reservation-real-frontend-proof`
- Host exposure: API `127.0.0.1:4100`, console `127.0.0.1:4300`, booking `127.0.0.1:4400`
- Disposable external frontend: `127.0.0.1:4500`
- Source was materialized with `git archive HEAD`; `.superpowers/` and `tmp/`
  were not copied or modified.
- PostgreSQL and PostgREST had no published host port.
- Screenshots contain test identities and reservation UUIDs only. They do not
  contain session cookies, CSRF values, management tokens, credentials, QR
  payloads, or raw environment values.
- Videos are silent browser-viewport recordings. They exclude browser chrome,
  address bars, session cookies, CSRF values, management tokens, credentials,
  QR payloads, and raw environment values.

All six long-running services reached their expected state: database, gateway,
API, booking, and console were healthy; PostgREST was running. Configuration,
migration, and seed one-shots exited successfully.

## Product Journey Results

| Product journey | Outcome | Durable verification |
| --- | --- | --- |
| Customer book → manage → cancel | Pass | Booking `9da5ff03-ae56-4d64-8337-03ef94807eff` ended `cancelled`, with the expected test customer and `2026-07-30` date. |
| External packed-SDK booking | Pass with install workaround | Booking `db27d52e-022f-40fe-8feb-65629ea697a3` is `confirmed`, with the expected test customer and `2026-08-01` date. |
| Owner overview and operations surfaces | Pass | Overview, reservations, Studio, analytics, system, channels, inbox, and safe settings pages rendered. |
| Owner Studio edit and deliberate publish | Pass with UX defect | Version 5 is published as `Apex Racing Lab Final Proof`; the UI replaces the success state with “Save a draft first.” |
| WhatsApp simulation → takeover → reply → resume | Pass | The newest proof conversation is `automated` after resume and contains durable staff replies. |
| Owner create appointment | Product failure | The form has no selectable practitioner and remains disabled; all three seeded racing resources lack `platform_staff_id`. |
| AI settings save | Configuration block | UI reports “AI credential encryption is not configured.” even for a disabled configuration. |
| Email settings save | Configuration block | UI reports “Email credential encryption is not configured.” even for a disabled configuration. |
| Staff Access | Product failure | The page renders the generic server-error boundary, consistent with the previously confirmed locations endpoint failure. |
| Start WhatsApp QR pairing | Product failure | The action renders the generic server-error boundary, consistent with the previously confirmed session-start 500. |

The owner proof suite reports 6/6 because it asserts both successful workflows
and the exact visible failure states. That number must not be interpreted as all
six product capabilities succeeding.

## Local Visual Evidence

Generated browser evidence is intentionally excluded from Git:

- `tmp/frontend-proof/screenshots/` contains 25 PNG screenshots.
- `tmp/frontend-proof/videos/` contains three silent browser-viewport WebM
  recordings: customer book/manage/cancel, owner operations/takeover, and the
  independent packed-SDK booking.

The recordings were captured against the same disposable Docker installation
used for the proof. Final frames were extracted and visually checked, and each
WebM was validated as a 1280×720 VP8 stream. Simulation proves the shared
orchestration and durable inbox, but it is not evidence of a real WhatsApp phone
connection.

The independent frontend lived outside the Git checkout. Its server imported
only the installed `@reservation-platform/sdk` tarball, and it had no
monorepo-source or database imports. Its first `pnpm install` attempted to fetch
the SDK's `@reservation-platform/contract-types@^0.1.0` dependency from npm and
received 404. A workspace-level pnpm override to the locally packed contract
tarball was required; a direct dependency alone was insufficient.

## Test Commands and Final Results

| Command or suite | Result |
| --- | --- |
| Isolated `docker compose up --build -d` | Pass; clean images built and services reached expected health/state. |
| Customer Playwright proof | 1 passed, 0 failed. |
| Owner Playwright proof | 6 passed, 0 failed; includes assertions of known failure states. |
| External frontend Playwright proof | 1 passed, 0 failed. |
| `pnpm run test:browser` against the live stack | 51 passed, 0 failed across desktop, mobile, and tablet Chromium. |
| `pnpm run test` | Pass, exit 0; package tests, standalone API verification, and migration bundle verification completed. |
| Browser video evidence | Pass; 3 playable 1280×720 VP8 WebM recordings, with visually checked final frames. |

## Not Claimed

- No real WhatsApp account was paired, because the QR start action currently
  fails before a QR is available.
- No real AI provider call was made; no provider credential was supplied.
- No real SMTP message was sent; no SMTP service or credential was supplied.
- Simulation proves internal channel orchestration, not Meta/WhatsApp delivery.
- This evidence records defects but intentionally changes no product code.

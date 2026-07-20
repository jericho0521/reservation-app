# First-time developer product acceptance checklist

Use this checklist when evaluating the reservation platform as a developer who
has never installed or implemented it before. The objective is to prove that a
new adopter can start from an untouched source or release bundle, run one
business in Docker, configure it through supported interfaces, accept a real
booking, and operate that booking without internal repository knowledge.

This is not a seeded-demo checklist. A working installation that depends on
old Docker volumes, fixture cookies, direct database changes, remembered
commands, or undocumented environment values does not pass.

## Acceptance rules

- Run the audit from a disposable directory under `tmp/`, not the working
  repository.
- Start with no copied `.env` files, generated configuration, Docker volumes,
  database state, `node_modules`, build output, or WhatsApp session state.
- Use only the documentation and files shipped to the developer.
- Do not inspect implementation code to discover an undocumented setup step
  until the original step has been recorded as failed.
- Do not edit source code, migration SQL, generated configuration, or database
  rows to complete the journey.
- Do not use fixture cookies, hard-coded session tokens, default passwords, or
  direct SQL to create the owner.
- Record every manual environment edit, undocumented command, retry, error,
  workaround, and confusing decision.
- A skipped check is not a pass. Use **Blocked** when a required credential,
  device, platform, or release artifact is unavailable.
- Record each relevant end-to-end browser journey and capture screenshots of
  the decisive before, success, rejection, degraded, and recovery states.
- A visual journey is not passed until its required recording and screenshots
  are listed in the evidence index and have been checked for sensitive data.
- Store logs, screenshots, recordings, JSON responses, and notes under `tmp/`.
  Never commit them.
- Never record passwords, API keys, SMTP credentials, WhatsApp QR payloads,
  session cookies, setup tokens, management links, or real customer data.

## Result meanings

- **Pass:** The documented journey completed and the observed result matched
  the expected result.
- **Fail:** The journey completed incorrectly, required an undocumented
  workaround, exposed unsafe information, or produced confusing behaviour.
- **Blocked:** A prerequisite outside the product was unavailable.
- **Not applicable:** The feature was intentionally excluded from this product
  installation.

## Test record

- Tester:
- Date:
- Source or release:
- Commit SHA:
- Release version:
- Operating system:
- CPU architecture:
- Docker version:
- Docker Compose version:
- Browser and version:
- Screen-recording tool:
- Started at:
- First healthy page at:
- First successful owner login at:
- First successful customer booking at:
- Finished at:
- Total undocumented workarounds:
- Evidence index:
- Overall result: [ ] Pass [ ] Fail [ ] Blocked

## Evidence directory

Create a private working copy:

```bash
mkdir -p tmp/first-time-developer-acceptance
cp docs/evaluation/first-time-developer-product-checklist.md \
  tmp/first-time-developer-acceptance/checklist.md
```

Complete the copy in `tmp/`. Keep the tracked checklist unchanged.

## Visual evidence requirements

Visual evidence must prove what the tester saw and did. It does not replace
API assertions, database checks, automated tests, or written notes.

Create this layout:

```text
tmp/first-time-developer-acceptance/
├── checklist.md
├── evidence-index.md
├── recordings/
├── screenshots/
├── results/
└── logs/
```

### Recording rules

- Record the full browser viewport for each required journey.
- Show the starting page, user action, loading state, and final outcome in the
  same recording whenever possible.
- Keep the relevant page title or URL origin visible, but hide sensitive path
  segments such as setup and reservation-management capabilities.
- Pause or stop recording before entering a password, API key, SMTP password,
  setup token, invitation token, WhatsApp QR, or other credential.
- Resume only after the sensitive value is no longer visible.
- Do not open browser storage, request headers, environment files, Docker
  secret volumes, QR payloads, or raw database rows while recording.
- Use fictional customer information.
- Keep recordings focused. Split independent journeys into separate files
  instead of producing one unreviewable recording.
- Review every recording before marking the related gate passed.

### Screenshot rules

- Capture the decisive state rather than every click.
- Include enough surrounding interface to identify the page and feature.
- Capture errors before applying a workaround.
- Capture both sides of important state transitions, such as availability
  before and after booking or owner status before and after completion.
- Crop or redact sensitive values before storing the image.
- Do not capture a WhatsApp QR, password field containing input, API key,
  session cookie, setup URL, invitation URL, or management URL.
- Review every screenshot at full resolution for accidental secret or personal
  information.

### File naming

Use stable, ordered filenames:

```text
recordings/G03-docker-first-start.mp4
recordings/G05-business-publish.mp4
recordings/G07-customer-booking.mp4
screenshots/G07-01-open-day-availability.png
screenshots/G07-02-resource-conflict.png
screenshots/G08-01-owner-booking-visible.png
results/G07-concurrency-result.json
logs/G03-compose-safe.log
```

Use `G01` through `G19` to match the gate number. Do not place customer names,
emails, tokens, reservation IDs, phone numbers, or credentials in filenames.

### Evidence index

Create `tmp/first-time-developer-acceptance/evidence-index.md` with one row per
artifact:

| Gate | Journey or state | Artifact | Sensitive-data review | Result |
| --- | --- | --- | --- | --- |
| G07 | Customer creates one valid booking | `recordings/G07-customer-booking.mp4` | [ ] Reviewed | [ ] Pass [ ] Fail |
| G08 | Booking appears in owner operations | `screenshots/G08-01-owner-booking-visible.png` | [ ] Reviewed | [ ] Pass [ ] Fail |

An artifact may support multiple assertions, but every required journey below
must have an explicit evidence-index entry.

### Minimum required recordings

- [ ] G03 — Docker first start, health inspection, and safe verification output
- [ ] G04 — First-owner flow and normal login, excluding credential entry
- [ ] G05 — Business configuration validation, publication, and public preview
- [ ] G07 — Valid customer booking from service selection through confirmation
- [ ] G07 — Conflict recovery after another request takes the selected resource
- [ ] G08 — Owner finds the customer booking and performs a lifecycle action
- [ ] G09 — Customer reschedules and cancels through the management page, with
  the capability hidden
- [ ] G10 — Staff invitation acceptance and assigned-location access
- [ ] G11 — Maintenance removes availability and ending it restores availability
- [ ] G12 — Deterministic chat proposal, explicit confirmation, and owner inbox
- [ ] G14 — Container restart followed by owner login and persisted-data check
- [ ] G16 — External SDK frontend performs a real booking

When live integrations are tested, also require:

- [ ] G13 — Live AI proposal and confirmation, excluding credential entry
- [ ] G13 — Live SMTP result in the controlled inbox, with personal details
  hidden
- [ ] G13 — WhatsApp inbound, outbound, takeover, and resume after pairing,
  without recording the QR or private phone details

### Minimum required screenshots

- [ ] Healthy Docker service state
- [ ] First successful owner operations page
- [ ] Complete business configuration before publication
- [ ] Publication success with version and public URL origin
- [ ] Open-day availability
- [ ] Closed-day or closure-date explanation
- [ ] Fully booked or already-taken resource explanation
- [ ] Maintenance-unavailable resource
- [ ] Valid customer confirmation with identifiers redacted
- [ ] Booking visible in owner operations
- [ ] Completed, no-show, and cancelled owner states
- [ ] Customer reschedule success
- [ ] Customer cancellation success
- [ ] Staff assigned-location view
- [ ] Staff owner-only access rejection
- [ ] Deterministic chat degraded/available state without a provider credential
- [ ] System status before and after a tested failure or restart
- [ ] Desktop, tablet, and mobile public-booking layouts
- [ ] Restored installation with durable records present
- [ ] External SDK consumer frontend success

### Visual evidence acceptance

- [ ] Every required artifact exists under `tmp/`
- [ ] Every artifact is listed in `evidence-index.md`
- [ ] Every artifact references the exact tested commit or release in the test
  record
- [ ] Every artifact has been reviewed for credentials and personal data
- [ ] Recordings show complete journeys rather than success pages only
- [ ] Screenshots show decisive success, rejection, and recovery states
- [ ] No QR, token, credential, cookie, private URL, or real customer detail was
  recorded

## Gate 1 — Prepare a genuinely clean consumer directory

### Procedure

1. Export the exact commit or extract the exact release bundle into a new
   directory under `tmp/`.
2. Confirm the directory does not contain `.env`, `node_modules`, build output,
   generated stack configuration, database data, or prior evidence.
3. Choose a unique Compose project name so the audit cannot attach to existing
   containers or volumes.
4. Record the source SHA or release manifest before starting.
5. Confirm ports `4100`, `4300`, and `4400` are not supplied by another
   installation.

### Expected result

- The test directory is independent from the working repository.
- No existing container, image state, configuration, or volume is required.
- The exact tested source or release can be identified later.

### Checklist

- [ ] Source or release copied into a disposable directory
- [ ] No `.env` or generated secret/configuration file copied
- [ ] No `node_modules`, build output, or application data copied
- [ ] Unique Docker Compose project selected
- [ ] Existing platform containers and volumes cannot be reused
- [ ] Exact commit SHA or release manifest recorded
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Notes:
- Evidence:
- Defect:

## Gate 2 — Discover the installation path as a newcomer

### Procedure

1. Begin at the repository or release root.
2. Read only the landing README and the documents it links for installation.
3. Record how long it takes to find:
   - prerequisites;
   - the supported Docker command;
   - first-owner creation;
   - the console URL;
   - the public booking URL;
   - shutdown, restart, backup, and recovery instructions.
4. Record every ambiguous or contradictory instruction before continuing.

### Expected result

- A developer can identify one recommended installation path.
- Commands use plain `pnpm` where host-side pnpm is required.
- Docker requirements and supported operating systems are explicit.
- The documentation clearly distinguishes local development from a production
  single-business installation.
- No essential instruction is hidden only in a plan, test, or source file.

### Checklist

- [ ] One recommended Docker-first path is obvious
- [ ] Prerequisites are complete
- [ ] Local and production installation purposes are distinguishable
- [ ] First-owner instructions are linked
- [ ] Public and owner URLs are documented
- [ ] Restart and recovery instructions are discoverable
- [ ] No command invokes `corepack pnpm`
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Time to find the installation command:
- Ambiguous instructions:
- Missing instructions:
- Evidence:
- Defect:

## Gate 3 — Build and start Docker from zero

### Procedure

1. Follow the documented command exactly.
2. Do not create an `.env` file unless the documentation explicitly requires
   it.
3. Do not invent missing values or copy values from another installation.
4. Capture the start time and safe terminal output.
5. Wait for all permanent services to become healthy.
6. Inspect Compose state and bounded service logs.
7. Run the documented live verification command.

For the source-development stack, the expected commands are currently:

```bash
pnpm run stack:up
docker compose ps
pnpm run stack:verify:live
```

### Expected result

- Docker generates installation secrets and service configuration without
  requiring the developer to hand-maintain a large environment file.
- Database migrations run in order on an empty database.
- Product mode creates one setup-pending tenant and no demo business data.
- API, worker, console, booking frontend, database, gateway, and REST services
  start successfully.
- Failure output identifies the failing component and a recovery action.
- Logs contain no secrets, QR contents, credentials, or raw session state.

### Checklist

- [ ] Startup command works exactly as documented
- [ ] No undocumented environment variable is required
- [ ] No source or Compose edit is required
- [ ] Configuration and encryption keys are generated safely
- [ ] Empty database receives every indexed core migration
- [ ] Default startup contains no seeded business, service, resource, or reservation
- [ ] Permanent services become healthy
- [ ] One-shot configuration, migration, and seed services exit successfully
- [ ] Live-stack verification passes
- [ ] Logs are actionable and secret-free
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Build duration:
- Startup duration:
- Failed attempts:
- Manual edits:
- Evidence:
- Defect:

## Gate 4 — Create the first owner through a supported flow

### Procedure

1. Follow the documented first-owner flow.
2. Choose a synthetic owner name and an email address controlled by the tester.
3. Choose a password of at least 12 characters.
4. Confirm password input is masked and its full length is accepted.
5. Sign in through the normal login page.
6. Refresh the page and restart the browser once.
7. Attempt one incorrect password.

For the local source stack, obtain the protected browser URL with:

```bash
pnpm run stack:setup-url
```

Open that URL, create the owner in the browser, and complete the guided
appointment-business setup. Do not use the demo-only owner helper.

### Expected result

- Owner creation does not require fixture cookies, direct SQL, or a committed
  default password.
- Validation identifies the specific invalid field.
- Normal email/password login succeeds.
- Refreshing retains the authenticated session.
- Incorrect credentials produce a generic, safe error.
- Setup tokens and session values do not appear in URLs, logs, or screenshots.

### Checklist

- [ ] First-owner flow is documented
- [ ] Name, email, password, and confirmation are accepted correctly
- [ ] Password input is masked without truncating input
- [ ] No default password is committed or displayed
- [ ] Normal owner login succeeds
- [ ] Session survives refresh
- [ ] Incorrect password fails safely
- [ ] No fixture cookie or direct database access is required
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Time to first owner login:
- Validation problems:
- Evidence:
- Defect:

## Gate 5 — Configure one appointment business without editing code

### Procedure

Use the owner console to configure one fictional appointment/service business:

1. Set the business name, public slug, timezone, contact details, and branding.
2. Create one location.
3. Create at least two services with different durations.
4. Create at least two practitioners.
5. Assign every practitioner to the correct location and services.
6. Configure operating days, opening intervals, slot interval, minimum notice,
   booking horizon, buffers, and one closure date.
7. Add a short knowledge entry.
8. Enable web booking and deterministic web chat.
9. Validate the draft.
10. Publish it.
11. Open the public experience using the URL shown after publication.

### Expected result

- Every required concept is editable through the supported UI or documented
  API.
- Invalid or incomplete configuration identifies the exact field and recovery
  action.
- Practitioner choices are derived from valid staff, service, location, and
  reservable-resource mappings.
- Publish success remains visible and shows the published version and public
  URL.
- No source rebuild is required after changing business configuration.

### Checklist

- [ ] Business identity saved
- [ ] First location saved
- [ ] Two services saved with correct durations
- [ ] Two practitioners mapped to services and location
- [ ] Availability rules saved
- [ ] Closure date saved
- [ ] Knowledge entry saved
- [ ] Web booking enabled
- [ ] Deterministic chat enabled
- [ ] Validation explains incomplete fields
- [ ] Publication succeeds
- [ ] Published version and URL remain visible
- [ ] Public experience changes without a frontend rebuild
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Configuration steps that were unclear:
- Manual edits:
- Evidence:
- Defect:

## Gate 6 — Validate public availability before booking

### Procedure

1. Open the published booking page in a private browser window.
2. Check an open day within the booking horizon.
3. Check a closed weekday.
4. Check the configured closure date.
5. Check a date outside the booking horizon.
6. Check a date inside the minimum-notice window.
7. Select each service and practitioner.
8. Compare offered times with configured operating hours, duration, interval,
   buffer, reservations, and maintenance.

### Expected result

- Open days expose only valid aligned starts.
- Closed days and closure dates explain why no bookable times are offered.
- Dates outside notice and horizon rules do not expose slots.
- Service duration and practitioner assignments affect availability correctly.
- The page distinguishes fully booked, unavailable, maintenance, and remaining
  capacity states.
- Times are displayed in the business timezone.

### Checklist

- [ ] Open-day slots match configured hours
- [ ] Slot starts match the configured interval
- [ ] Service duration produces the correct end time
- [ ] Closed weekday exposes no bookable slot
- [ ] Closure date exposes no bookable slot
- [ ] Booking-horizon limit is enforced
- [ ] Minimum-notice limit is enforced
- [ ] Practitioner assignment is enforced
- [ ] Maintenance is reflected
- [ ] Remaining capacity or resource state is understandable
- [ ] Business timezone is used consistently
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Dates and services tested:
- Expected slots:
- Observed slots:
- Evidence:
- Defect:

## Gate 7 — Complete a customer booking and prove strict write validation

### Procedure

1. Select a valid service, practitioner or resource, date, and time.
2. Enter fictional customer information.
3. Review every detail.
4. Confirm once.
5. Preserve the management page privately for Gate 9.
6. Attempt the following through the public API or UI:
   - the same resource and time again;
   - a closed day;
   - a time before opening;
   - a time after closing;
   - an incorrect duration;
   - an inactive or unassigned practitioner;
   - a resource in maintenance;
   - the same idempotency key with the same body;
   - the same idempotency key with a different body.
7. Send at least eight simultaneous requests for one remaining resource and
   interval.

### Expected result

- The valid request creates exactly one reservation.
- An idempotent replay returns the original reservation.
- Reusing the key with a different request is rejected.
- Closed, off-hours, wrong-duration, inactive, unassigned, maintenance, and
  already-taken requests are rejected at the database write boundary.
- Concurrent requests produce exactly one winner and conflicts for the rest.
- No conflict returns `500`, deadlocks, or creates duplicate rows.
- The customer receives a specific, safe message and refreshed availability.

### Checklist

- [ ] Valid booking succeeds once
- [ ] Confirmation identifies the service, date, time, and resource/practitioner
- [ ] Idempotent replay returns the same reservation
- [ ] Idempotency mismatch is rejected
- [ ] Already-taken resource returns a conflict
- [ ] Closed-day request is rejected
- [ ] Before-opening request is rejected
- [ ] After-closing request is rejected
- [ ] Wrong-duration request is rejected
- [ ] Inactive practitioner is rejected
- [ ] Cross-location or unassigned practitioner is rejected
- [ ] Maintenance conflict is rejected
- [ ] Concurrent test creates one reservation only
- [ ] Concurrent losers return conflicts, not internal errors
- [ ] Availability refreshes after a conflict
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Successful reservation reference, redacted:
- Concurrency result:
- Error responses observed:
- Evidence:
- Defect:

## Gate 8 — Prove the booking appears in owner operations

### Procedure

1. Open the owner reservation or appointment page.
2. Select the booking location and date.
3. Find the reservation created in Gate 7.
4. Verify service, location, practitioner/resource, date, time, customer,
   channel, quantity, and status.
5. Search using a fictional customer field.
6. Refresh and sign out/in.
7. Create separate reservations to exercise Confirmed, Completed, No-show, and
   Cancelled outcomes.
8. Supply an audit reason where required.

### Expected result

- A successful customer booking becomes visible without a restart or direct
  database inspection.
- Venue filtering cannot hide a valid venue-scoped row.
- Owner-visible values match the customer confirmation.
- Lifecycle changes persist and terminal states remain terminal.
- Required reasons are validated and an audit event is written.

### Checklist

- [ ] Customer booking appears on the correct date
- [ ] Location is present and correct
- [ ] Service and practitioner/resource are correct
- [ ] Customer and channel are correct
- [ ] Search finds the reservation
- [ ] Refresh retains the reservation
- [ ] Sign-out/sign-in retains the reservation
- [ ] Completion succeeds
- [ ] No-show requires and records a reason
- [ ] Cancellation requires and records a reason
- [ ] Terminal status cannot be incorrectly reopened
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Owner-visible mismatches:
- Evidence:
- Defect:

## Gate 9 — Manage the booking as the customer

### Procedure

1. Open the private management page issued in Gate 7.
2. Confirm it exposes only the associated reservation.
3. Request availability for a different valid time.
4. Reschedule the reservation.
5. Verify the old capacity is released and the new capacity is occupied.
6. Reload the management page.
7. Cancel the reservation with a fictional reason.
8. Reload again.
9. Try an invalid, expired, revoked, and wrong-business management capability.

### Expected result

- The valid capability can read, reschedule, and cancel only one reservation.
- Rescheduling revalidates current availability atomically.
- Cancellation releases capacity.
- Invalid capability variants return the same safe not-found response.
- Capability values never appear in logs or committed evidence.

### Checklist

- [ ] Managed read succeeds
- [ ] Only one reservation is exposed
- [ ] Current availability is used for rescheduling
- [ ] Reschedule persists after reload
- [ ] Old capacity is released
- [ ] New capacity is occupied
- [ ] Cancellation persists after reload
- [ ] Cancelled capacity is released
- [ ] Invalid capability fails safely
- [ ] Cross-business capability use fails safely
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Evidence:
- Defect:

## Gate 10 — Test staff access and location isolation

### Procedure

1. Invite a fictional staff account as the owner.
2. Accept the invitation through the documented flow.
3. Assign the staff member to exactly one location.
4. Sign in as staff.
5. Verify the assigned location is visible.
6. Attempt owner-only settings and another location.
7. Disable the staff account and retry access.

### Expected result

- Invitations are single-use and do not expose raw capability values.
- Staff see only assigned locations and operational actions.
- Staff cannot access owner integration, business, or security settings.
- Cross-location reads and mutations are rejected server-side.
- Disabled staff sessions no longer authorize access.

### Checklist

- [ ] Invitation succeeds
- [ ] Invitation acceptance is single-use
- [ ] Staff login succeeds
- [ ] Assigned location is visible
- [ ] Unassigned location is inaccessible
- [ ] Owner-only settings are inaccessible
- [ ] Staff can perform permitted appointment operations
- [ ] Disabled account loses access
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Evidence:
- Defect:

## Gate 11 — Test maintenance and capacity recovery

### Procedure

1. Create a future reservation for one practitioner/resource.
2. Start overlapping maintenance for that practitioner/resource.
3. Observe the owner warning.
4. Check public availability.
5. Attempt to reserve the maintained resource directly.
6. End maintenance.
7. Check availability again.

### Expected result

- The owner sees a conflict warning before maintenance affects an existing
  reservation.
- Maintained resources are not offered or accepted.
- Other valid practitioners/resources remain usable.
- Ending maintenance restores future availability without restarting services.

### Checklist

- [ ] Existing-reservation warning appears
- [ ] Maintenance state persists
- [ ] Maintained resource is removed from availability
- [ ] Direct maintained-resource request is rejected
- [ ] Other capacity remains available
- [ ] Ending maintenance restores availability
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Evidence:
- Defect:

## Gate 12 — Test deterministic chat and channel operations

### Procedure

1. Use web chat without a live AI credential.
2. Ask for services, opening hours, and an available appointment.
3. Continue until a structured proposal is shown.
4. Confirm that no reservation exists before explicit confirmation.
5. Confirm the proposal.
6. Find the conversation and reservation in the owner console.
7. Use WhatsApp simulation to create a conversation.
8. Take over the conversation.
9. Send another simulated inbound message.
10. Send a staff reply and resume automation.

### Expected result

- Missing AI configuration does not terminate or disable the API.
- Deterministic chat uses real catalog and availability data.
- Explicit confirmation is required.
- Conversation and reservation are linked.
- Staff takeover suppresses automated fallback replies.
- Staff reply and automation resume preserve conversation history.
- Simulation is visibly labelled and cannot be mistaken for real WhatsApp.

### Checklist

- [ ] Deterministic chat works without an AI credential
- [ ] Service and availability answers use configured data
- [ ] Proposal contains valid availability
- [ ] No reservation exists before confirmation
- [ ] Confirmation creates one reservation
- [ ] Owner sees linked conversation and reservation
- [ ] WhatsApp simulation is clearly labelled
- [ ] Takeover suppresses automation
- [ ] Staff reply persists
- [ ] Resume restores automation
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Evidence:
- Defect:

## Gate 13 — Test live AI, SMTP, and WhatsApp separately

These proofs require credentials, an inbox, or a physical phone. Do not mark
them passed based on simulation.

### Live AI

- [ ] Save a disposable provider credential through the console
- [ ] Confirm the credential becomes write-only after saving
- [ ] Test the configured connection
- [ ] Produce a real structured booking proposal
- [ ] Confirm the proposal through the shared reservation engine
- [ ] Revoke the credential
- [ ] Verify deterministic fallback still works
- Result: [ ] Pass [ ] Fail [ ] Blocked [ ] Not applicable
- Provider/model:
- Evidence:
- Defect:

### Live SMTP

- [ ] Save test SMTP settings through the console
- [ ] Test the SMTP connection
- [ ] Receive a booking confirmation
- [ ] Receive a staff invitation
- [ ] Receive a password-reset message
- [ ] Verify credentials are absent from logs and responses
- Result: [ ] Pass [ ] Fail [ ] Blocked [ ] Not applicable
- Evidence:
- Defect:

### Live WhatsApp through Baileys

- [ ] Start QR pairing from the private owner page
- [ ] Scan the QR without recording it
- [ ] Confirm connected status
- [ ] Receive one real inbound customer message
- [ ] Deliver one automated outbound reply
- [ ] Create and confirm one reservation
- [ ] Exercise takeover, staff reply, and automation resume
- [ ] Restart containers and restore the encrypted session
- [ ] Log out and verify the old session cannot reconnect
- [ ] Confirm QR, credentials, and raw session state are absent from logs
- Result: [ ] Pass [ ] Fail [ ] Blocked [ ] Not applicable
- Evidence:
- Defect:

## Gate 14 — Restart and persistence

### Procedure

1. Record safe counts or redacted references for the business, owner,
   published version, staff, reservations, conversations, and maintenance.
2. Run the documented stack shutdown without deleting volumes.
3. Start the stack again.
4. Wait for health checks.
5. Sign in normally.
6. Recheck the recorded records and public experience.
7. Verify any connected WhatsApp session only when live pairing was tested.

The automated local persistence proof is:

```bash
pnpm run stack:verify:persistence
```

### Expected result

- Durable business and reservation data survive container recreation.
- Generated secrets remain valid without being exposed.
- Migrations do not reapply incorrectly.
- Owner login and public booking work after restart.
- Encrypted WhatsApp state restores only when configured.

### Checklist

- [ ] Stack stops cleanly
- [ ] Stack starts cleanly
- [ ] Health checks recover
- [ ] Owner login still works
- [ ] Business configuration persists
- [ ] Publication persists
- [ ] Staff assignments persist
- [ ] Reservations and conversations persist
- [ ] Maintenance state persists
- [ ] Public booking still works
- [ ] Automated persistence proof passes
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Evidence:
- Defect:

## Gate 15 — Backup, restore, and failure recovery

### Procedure

1. Follow the documented backup procedure.
2. Record the backup checksum without recording its contents.
3. Mutate or remove synthetic test data.
4. Restore the backup.
5. Compare durable counts and redacted identifiers.
6. Exercise documented recovery for:
   - failed migration;
   - unavailable worker;
   - unavailable API;
   - unavailable database;
   - a full host or Docker restart.

### Expected result

- Backup and restore require no database expertise beyond the documentation.
- Restored data is equivalent and usable.
- Partial service failures are visible to the owner/operator.
- Recovery guidance is actionable and does not suggest deleting volumes.
- Support output remains sanitized.

### Checklist

- [ ] Backup completes
- [ ] Backup checksum recorded
- [ ] Restore completes
- [ ] Durable record counts match
- [ ] Restored owner login works
- [ ] Restored public booking works
- [ ] Worker failure is visible
- [ ] API failure is diagnosable
- [ ] Database failure is diagnosable
- [ ] Recovery documentation is sufficient
- [ ] Support output contains no secret or personal data
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Evidence:
- Defect:

## Gate 16 — Install and use the SDK as an external developer

### Procedure

1. Create another empty directory outside the monorepo workspace.
2. Install only the released `@reservation-platform/sdk` and matching
   `@reservation-platform/contract-types` artifacts.
3. Do not add workspace overrides, monorepo paths, Supabase, database adapters,
   or backend runtime packages.
4. Build a minimal frontend that:
   - reads the public experience;
   - lists services;
   - reads availability;
   - creates a reservation;
   - reads the management view;
   - reschedules;
   - cancels.
5. Compare SDK behaviour with direct HTTP behaviour.

Run the repository-owned distribution gates when their required local registry
configuration is available:

```bash
pnpm run sdk:release-gate
pnpm run sdk:registry-install-proof:strict
pnpm run sdk:live-parity:strict
```

### Expected result

- Installation succeeds in an empty directory with zero dependency overrides.
- The consumer imports only documented public package exports.
- Browser code contains no Supabase or backend credentials.
- SDK and direct HTTP requests return equivalent contracts and errors.
- A real booking completes through the external frontend.

### Checklist

- [ ] Empty-directory package installation succeeds
- [ ] No workspace or file override is required
- [ ] SDK and contract-types versions match
- [ ] External frontend builds
- [ ] Experience and service reads succeed
- [ ] Availability read succeeds
- [ ] Booking succeeds
- [ ] Managed reschedule succeeds
- [ ] Managed cancellation succeeds
- [ ] Direct HTTP and SDK behaviour match
- [ ] Consumer contains no backend-only import
- [ ] Strict registry proof passes
- [ ] Strict live parity passes
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Evidence:
- Defect:

## Gate 17 — Security, privacy, and operational safety

### Procedure

1. Inspect browser requests, application logs, support output, screenshots, and
   generated configuration names.
2. Test anonymous, owner, staff, management-capability, and wrong-venue access.
3. Exercise CSRF, idempotency, payload validation, and bounded rate limits.
4. Confirm database and PostgREST are not published outside the private Docker
   network.

### Expected result

- Secrets are generated and stored without being returned to browsers or logs.
- Public responses contain only public projections.
- Owner, staff, venue, and customer-management scopes fail closed.
- Errors are stable, specific enough to recover, and free of storage details.
- Only intended web entry points are exposed.

### Checklist

- [ ] No API key, password, session, QR, or service-role key appears in logs
- [ ] Public experience omits private tenant and credential data
- [ ] Anonymous owner access is rejected
- [ ] Staff owner-only access is rejected
- [ ] Cross-location access is rejected
- [ ] Invalid management capability fails safely
- [ ] CSRF protection works for cookie mutations
- [ ] Idempotency prevents duplicate mutations
- [ ] Malformed payloads return stable validation errors
- [ ] Rate limiting returns actionable bounded responses
- [ ] Database has no host port
- [ ] PostgREST has no host port
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Evidence:
- Defect:

## Gate 18 — Product usability and developer experience

Evaluate the installation without compensating for confusing behaviour using
knowledge of the codebase.

### Checklist

- [ ] The first action is obvious
- [ ] Progress and loading states are visible
- [ ] Empty states explain the next action
- [ ] Errors identify what failed and how to recover
- [ ] Closed, unavailable, and fully booked states are distinguishable
- [ ] Owner and customer terminology is consistent
- [ ] Dates and times are unambiguous
- [ ] Destructive actions require confirmation or a reason
- [ ] Success states persist long enough to understand the outcome
- [ ] Desktop layout is usable
- [ ] Tablet layout is usable
- [ ] Mobile layout is usable
- [ ] Keyboard-only journeys are usable
- [ ] Reduced-motion preference is respected
- [ ] Screen-reader labels and live status messages are meaningful
- [ ] Documentation uses commands that work on the tested platform
- [ ] No step assumes hidden monorepo knowledge
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Most confusing step:
- Most valuable feature:
- Highest-friction setup requirement:
- Evidence:
- Defect:

## Gate 19 — Automated final verification

Run these gates against the same exact source or release candidate used by the
manual audit:

```bash
pnpm run ci:verify
pnpm run test:e2e
pnpm run test:browser
pnpm run stack:verify:onboarding
pnpm run stack:verify:smoke
pnpm run stack:verify:live
pnpm run stack:verify:persistence
pnpm run database:live-proof:strict
pnpm run deploy:verify
```

Run strict production, SDK, recovery, and external-integration proofs only when
their documented isolated environment and credentials are available. A
configuration-related skip must be reported as **Blocked — not proven**.

### Checklist

- [ ] `ci:verify` passes
- [ ] E2E suite passes with every skip explained
- [ ] Browser suite passes
- [ ] Docker smoke passes
- [ ] Live-stack verification passes
- [ ] Persistence verification passes
- [ ] Strict database proof passes
- [ ] Deployment verification passes
- [ ] No executable script invokes `corepack pnpm`
- [ ] Migration index is current
- [ ] Release manifest is current
- Result: [ ] Pass [ ] Fail [ ] Blocked
- Skipped checks and reasons:
- Evidence:
- Defect:

## Final acceptance gate

The product passes this first-time developer audit only when all of the
following are true:

- [ ] A clean developer reaches a healthy Docker installation using only
  shipped documentation.
- [ ] No undocumented environment edit, source edit, direct SQL, fixture
  cookie, or prior Docker state is required.
- [ ] The owner is created through a supported flow and normal login works.
- [ ] One appointment business is configured and published without rebuilding
  source.
- [ ] A customer can find valid availability and create exactly one booking.
- [ ] Invalid, stale, off-hours, maintenance, and concurrent requests fail
  safely.
- [ ] The booking appears immediately in owner operations.
- [ ] Customer management, owner lifecycle, staff access, maintenance, and
  deterministic chat work.
- [ ] Restart and restore preserve a usable installation.
- [ ] An external developer can install and use released SDK artifacts without
  monorepo overrides.
- [ ] External AI, SMTP, and WhatsApp checks are either proven or explicitly
  marked **Blocked — not proven**.
- [ ] No P0 or P1 defect remains.
- [ ] Evidence references the exact tested commit or release.
- [ ] Required screen recordings and screenshots are complete.
- [ ] Every visual artifact is indexed and has passed sensitive-data review.

## Final verdict

- Overall result: [ ] Pass [ ] Fail [ ] Blocked
- Visual evidence result: [ ] Pass [ ] Fail [ ] Blocked
- Missing recordings:
- Missing screenshots:
- P0 defects:
- P1 defects:
- Other defects:
- Required documentation changes:
- Required setup changes:
- Required product changes:
- Retest scope:
- Final notes:

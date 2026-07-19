# Manually test the local Docker product

Use this guide to test the platform as a business owner, staff member, and
customer. It is written for the seeded local Docker installation, not a
production server.

Complete the tests in order. Record only synthetic or redacted evidence. Never
record passwords, session cookies, invitation tokens, reservation-management
links, API keys, SMTP credentials, WhatsApp QR codes, phone numbers, or real
customer information.

## Create your working copy

Keep personal test notes and screenshots outside the tracked documentation:

```bash
mkdir -p tmp/manual-acceptance
cp docs/how-to/manual-docker-acceptance.md \
  tmp/manual-acceptance/manual-docker-acceptance-$(date +%F).md
```

Fill in the copy under `tmp/manual-acceptance/`. Files under `tmp/` must not be
committed.

## Test record

- Tester:
- Date:
- Commit SHA:
- Browser and version:
- Operating system:
- Started at:
- Finished at:
- Overall verdict: [ ] Pass [ ] Fail [ ] Blocked

Use these meanings consistently:

- **Pass:** the observed result matches the expected result.
- **Fail:** the journey completed, but its behavior or result was incorrect.
- **Blocked:** the journey could not be completed because a prerequisite or
  external credential was unavailable.
- **Not applicable:** the feature was deliberately outside this test run.

## Test data rules

- Use fictional customer names.
- Use an inbox and phone number controlled by you only when delivery must be
  tested.
- Choose a password of at least 12 characters.
- For Apex Racing Lab, choose a Monday–Saturday within the next 60 days.
- Do not use Sunday for Apex. The seeded business is closed on Sunday.
- Do not reuse a reservation when testing terminal outcomes. Completion,
  no-show, and cancellation should use separate reservations.

## 1. Start and inspect the Docker stack

From the repository root:

```bash
pnpm run stack:up
docker compose ps
```

Wait until the database, API, worker, console, booking application, and gateway
are ready. Then run:

```bash
pnpm run stack:verify:live
```

Open these URLs:

- Owner console: <http://127.0.0.1:4300/admin/login>
- Apex public experience: <http://127.0.0.1:4400/apex-racing-demo>
- Luma public experience: <http://127.0.0.1:4400/luma-appointments-demo>
- API health: <http://127.0.0.1:4100/v1/health>

Expected result:

- Compose services are running or have completed successfully.
- The health endpoint reports a healthy API.
- The console and both public experiences load without an error page.
- No secret value appears in the terminal or browser.

Checklist:

- [ ] Pass
- [ ] Fail
- [ ] Blocked
- Notes:
- Evidence filename:
- Defect or follow-up:

## 2. Create the local owner and sign in

Create or replace the seeded local owner:

```bash
pnpm run stack:owner
```

Enter your chosen owner name and email. Enter a password containing at least 12
characters. The command should display one `*` for each captured password
character.

Sign in at <http://127.0.0.1:4300/admin/login> with the same email and password.

Expected result:

- The command reports that the local owner is ready.
- Normal email/password login succeeds.
- The owner reaches the operations command center.
- Refreshing the page keeps the authenticated session.
- An incorrect password produces a safe error and does not expose account
  details.

Checklist:

- [ ] Pass
- [ ] Fail
- [ ] Blocked
- Notes:
- Evidence filename:
- Defect or follow-up:

## 3. Inspect the owner command center

Open <http://127.0.0.1:4300/admin>.

Check:

1. The business name and local date are correct.
2. The reservation timeline renders.
3. The attention list contains actionable links when an item needs attention.
4. The published experience version is visible.
5. Navigation opens Reservations, Conversations, Resources & maintenance,
   Channels & AI, Analytics, and System status.

Expected result:

- No section crashes or displays raw JSON.
- Times are presented in `Asia/Kuala_Lumpur`.
- Links open the corresponding operational page.

Checklist:

- [ ] Pass
- [ ] Fail
- [ ] Blocked
- Notes:
- Evidence filename:
- Defect or follow-up:

## 4. Complete an Apex customer booking

Use a separate browser tab or private window:

1. Open <http://127.0.0.1:4400/apex-racing-demo/book>.
2. Select **Apex GT Racing Session**.
3. Select a Monday–Saturday within the next 60 days.
4. Select an available time between 09:00 and 17:00.
5. Select an available simulator.
6. Enter fictional customer details.
7. Review the service, date, time, simulator, quantity, and customer details.
8. Press **Confirm reservation** once.
9. Keep the displayed management link open for the next test, but do not copy
   it into this document or a screenshot.

Expected result:

- The availability screen shows live slots for an open day.
- Simulator C may be unavailable because the seed places it in maintenance.
- A confirmation appears after one submission.
- The confirmation contains a reservation identifier and management action.
- Repeated clicking does not create duplicate reservations.

If the page reports no slots, press **Back** and confirm that the selected date
is not Sunday. The seeded API should normally provide 17 one-hour starts from
09:00 through 17:00 on an open, conflict-free day.

Checklist:

- [ ] Pass
- [ ] Fail
- [ ] Blocked
- Reservation reference, redacted:
- Selected date and time:
- Selected simulator:
- Notes:
- Evidence filename:
- Defect or follow-up:

## 5. Manage the customer reservation

Use the private management page produced by the previous booking:

1. Confirm the page loads without owner authentication.
2. Confirm it exposes only the customer's reservation.
3. Choose a different available date or time.
4. Confirm the reschedule.
5. Reload the page and verify the new date and time remain.
6. Cancel the reservation with a fictional reason.
7. Reload the page and verify the status is cancelled.

Expected result:

- The opaque management link grants access only to its reservation.
- Rescheduling uses current availability.
- Cancellation releases the booked capacity.
- Cancelled reservations cannot be rescheduled as active reservations.
- The page never displays owner credentials, service-role keys, or internal
  database information.

Checklist:

- [ ] Pass
- [ ] Fail
- [ ] Blocked
- Original date and time:
- Rescheduled date and time:
- Final status:
- Notes:
- Evidence filename:
- Defect or follow-up:

## 6. Complete a practitioner appointment booking

Open <http://127.0.0.1:4400/luma-appointments-demo/book>.

1. Select **Luma Consultation**.
2. Select a visible practitioner.
3. Choose a Monday–Saturday within the booking horizon.
4. Select an available 30-minute slot.
5. Enter fictional customer details.
6. Review and confirm the appointment.

Expected result:

- Specialist Maya and Specialist Noah are available as practitioner choices.
- Time slots load only after a practitioner is selected.
- The review identifies the selected practitioner.
- The confirmed appointment retains its practitioner assignment.

Checklist:

- [ ] Pass
- [ ] Fail
- [ ] Blocked
- Practitioner:
- Selected date and time:
- Reservation reference, redacted:
- Notes:
- Evidence filename:
- Defect or follow-up:

## 7. Verify customer bookings in owner operations

Return to the owner console and open
<http://127.0.0.1:4300/admin/reservations>.

1. Find the Apex and Luma reservations created during this run.
2. Verify service, customer, date, time, channel, resource or practitioner, and
   status.
3. Open each reservation detail page.
4. Confirm that the cancelled customer reservation remains in history.

Expected result:

- Newly created bookings appear without a data reset.
- Web bookings are identified as web/form bookings.
- Detail pages match the customer-facing confirmation.
- Cancelled records remain auditable instead of disappearing.

Checklist:

- [ ] Pass
- [ ] Fail
- [ ] Blocked
- Notes:
- Evidence filename:
- Defect or follow-up:

## 8. Test the owner appointment lifecycle

Open <http://127.0.0.1:4300/admin/reservations>.

Create at least three separate fictional appointments so terminal outcomes do
not overlap:

1. Use **Create appointment** to select a service, practitioner, live date, and
   time.
2. Open the first appointment and reschedule it.
3. Mark the first appointment complete.
4. Mark the second appointment as no-show.
5. Cancel the third appointment with an audit reason.
6. Attempt to select an unavailable practitioner or conflicting slot where the
   UI permits the attempt.

Expected result:

- Staff-assisted creation uses the same live availability as public booking.
- Rescheduling updates the appointment without creating a duplicate.
- Complete, no-show, and cancelled statuses persist.
- Terminal appointments no longer expose invalid lifecycle actions.
- Conflicting or inactive choices are rejected safely.

Checklist:

- [ ] Pass
- [ ] Fail
- [ ] Blocked
- Completed appointment reference, redacted:
- No-show appointment reference, redacted:
- Cancelled appointment reference, redacted:
- Notes:
- Evidence filename:
- Defect or follow-up:

## 9. Test resources and maintenance

Open <http://127.0.0.1:4300/admin/resources>.

1. Confirm Simulator C is shown in maintenance.
2. Verify any future reservation warning before changing a resource.
3. Start maintenance on an otherwise available test resource with a fictional
   reason.
4. Open the public Apex availability flow and verify that resource is no longer
   selectable.
5. End the maintenance event with a resolution note.
6. Reload public availability and verify the resource becomes selectable again.

Expected result:

- Maintenance changes capacity without deleting the resource.
- Conflict warnings link to affected reservations.
- Public availability reflects maintenance changes.
- Ending maintenance restores the resource.

Checklist:

- [ ] Pass
- [ ] Fail
- [ ] Blocked
- Resource tested:
- Notes:
- Evidence filename:
- Defect or follow-up:

## 10. Test Studio draft, preview, and publishing

Open <http://127.0.0.1:4300/admin/studio>.

Make a harmless, reversible change, such as adding a short suffix to the
customer-facing description:

1. Open **Branding & terminology**.
2. Save the change as a draft.
3. Open the preview and confirm the draft is visible there.
4. Confirm the live public experience has not changed yet.
5. Open **Preview & publish**.
6. Resolve any linked validation issue.
7. Check the publication confirmation and publish.
8. Confirm the success screen shows the published version and public URL.
9. Open **View public experience** and verify the published change.
10. Use **Create next revision** to confirm another draft can be started.

Expected result:

- Draft changes do not leak into the published experience.
- Validation links lead to the section that needs correction.
- Publishing produces a durable success state.
- The success page offers **View public experience** and
  **Create next revision**.

Checklist:

- [ ] Pass
- [ ] Fail
- [ ] Blocked
- Previous version:
- Published version:
- Change tested:
- Notes:
- Evidence filename:
- Defect or follow-up:

## 11. Test WhatsApp simulation and staff takeover

Simulation is the required credential-free test. It is not proof of live
WhatsApp delivery.

1. Open <http://127.0.0.1:4300/admin/channels>.
2. Find **Simulate a WhatsApp customer**.
3. Use a fictional customer and send a booking-related message.
4. Open the resulting unified conversation.
5. Press **Take over conversation**.
6. Confirm the page says **You are in control**.
7. Send a fictional staff reply.
8. Confirm no automated fallback reply is added while takeover is active.
9. Press **Resume AI automation**.
10. Send another simulated customer message and confirm automation can respond.

Expected result:

- The simulated inbound message, automation reply, and staff reply share one
  timeline.
- Manual takeover suppresses automation.
- Staff cannot send before taking over.
- Resuming automation changes the conversation state without losing history.

Checklist:

- [ ] Pass
- [ ] Fail
- [ ] Blocked
- Conversation reference, redacted:
- Notes:
- Evidence filename:
- Defect or follow-up:

## 12. Test public web chat and deterministic fallback

Open <http://127.0.0.1:4400/apex-racing-demo/chat>.

1. Send a fictional booking question.
2. Wait for the response to appear.
3. Ask for availability for an open date and time.
4. If the assistant proposes a booking, review the proposal before confirming.
5. Confirm only through the explicit confirmation control.
6. Check the conversation in the owner unified inbox.

Expected result:

- Chat remains usable when no external AI provider is configured.
- Invalid optional AI configuration does not terminate the API.
- The owner system status may report AI as degraded while web booking and
  deterministic chat continue.
- A conversation cannot silently create a reservation without confirmation.

Checklist:

- [ ] Pass
- [ ] Fail
- [ ] Blocked
- AI mode observed: [ ] Live provider [ ] Deterministic fallback
- Reservation created: [ ] Yes [ ] No
- Notes:
- Evidence filename:
- Defect or follow-up:

## 13. Test staff access

Open <http://127.0.0.1:4300/admin/settings/staff>.

1. Invite a fictional staff user and assign only one location.
2. If email delivery is not configured, copy the one-time invitation link
   directly into a private browser window. Do not record the token.
3. Accept the invitation and create a password of at least 12 characters.
4. Sign in as the staff user.
5. Verify the assigned location is available.
6. Verify owner-only settings are unavailable.
7. Disable the staff account from the owner session.
8. Confirm the disabled account can no longer sign in.

Expected result:

- The invitation link appears only when required.
- Staff access is restricted to assigned locations.
- Staff cannot access owner-only provider, system, or staff-management pages.
- Disabling access preserves historical activity.

Checklist:

- [ ] Pass
- [ ] Fail
- [ ] Blocked
- Staff role tested:
- Assigned location:
- Notes:
- Evidence filename:
- Defect or follow-up:

## 14. Inspect analytics

Open <http://127.0.0.1:4300/admin/analytics>.

1. Choose a date range containing this test run.
2. Confirm web reservations contribute to service and channel totals.
3. Enable simulation inclusion and compare the result.
4. Check popular services, time slots, channel conversion, cancellations, and
   capacity information.

Expected result:

- Metrics use the selected range.
- Simulation is excluded or included according to the selected option.
- Counts can be reconciled with the reservations and conversations created in
  this run.
- The page labels descriptive results as measured outcomes, not forecasts.

Checklist:

- [ ] Pass
- [ ] Fail
- [ ] Blocked
- Date range:
- Reservation count observed:
- Conversation count observed:
- Notes:
- Evidence filename:
- Defect or follow-up:

## 15. Inspect system status and degraded integrations

Open <http://127.0.0.1:4300/admin/system>.

Check the database, API, worker, migrations, release, storage, backup, email, AI,
and WhatsApp states.

Expected result:

- Core services report healthy or provide an actionable explanation.
- Missing optional provider credentials appear as setup-required or degraded,
  not as a platform outage.
- No credential value or raw provider payload appears.
- The status is consistent with Channels & AI.

Checklist:

- [ ] Pass
- [ ] Fail
- [ ] Blocked
- Degraded components:
- Explanation shown:
- Notes:
- Evidence filename:
- Defect or follow-up:

## 16. Test restart and persistence

Keep the identifiers of at least one reservation and conversation, but do not
record their private management tokens.

Restart the application containers:

```bash
docker compose restart \
  reservation-api \
  reservation-worker \
  reservation-console \
  reservation-booking
```

Wait for readiness:

```bash
docker compose ps
pnpm run stack:verify:live
```

Then:

1. Sign in again if required.
2. Find the reservation created earlier.
3. Find the simulated conversation and staff reply.
4. Confirm the published Studio version remains live.
5. Open public availability and verify slots still load.

Expected result:

- Durable reservations, conversations, maintenance state, owner credentials,
  and published configuration survive container restart.
- The API, worker, console, and booking application recover without manual
  environment edits.

Checklist:

- [ ] Pass
- [ ] Fail
- [ ] Blocked
- Services that failed to recover:
- Data verified after restart:
- Notes:
- Evidence filename:
- Defect or follow-up:

## 17. Optional live integration tests

Mark unavailable credentials as **Blocked — not proven**, never as passed.

### SMTP email

- [ ] Save a test SMTP account through **Email delivery**.
- [ ] Test the connection.
- [ ] Receive a test email.
- [ ] Receive a booking confirmation.
- [ ] Receive a staff invitation or password-reset message.
- [ ] Confirm credentials do not appear in logs, responses, or screenshots.
- Status: [ ] Pass [ ] Fail [ ] Blocked [ ] Not applicable
- Notes:
- Evidence filename:

### Live AI provider

- [ ] Save a disposable provider credential through **AI provider**.
- [ ] Test the connection.
- [ ] Produce a structured booking proposal.
- [ ] Confirm the proposal through the reservation engine.
- [ ] Revoke the credential.
- [ ] Confirm deterministic fallback still works.
- [ ] Confirm credentials do not appear in logs, responses, or screenshots.
- Status: [ ] Pass [ ] Fail [ ] Blocked [ ] Not applicable
- Notes:
- Evidence filename:

### Live WhatsApp through Baileys

- [ ] Start QR pairing from **WhatsApp setup**.
- [ ] Scan the QR without recording it.
- [ ] Receive a real inbound message.
- [ ] Complete or propose a reservation.
- [ ] Exercise takeover, staff reply, and automation resume.
- [ ] Restart the containers and verify encrypted session restoration.
- [ ] Disconnect the session and verify the old session cannot reconnect.
- [ ] Confirm QR and session contents do not appear in logs.
- Status: [ ] Pass [ ] Fail [ ] Blocked [ ] Not applicable
- Notes:
- Evidence filename:

## 18. Quick usability and accessibility checks

Repeat the public booking and owner reservation journeys with:

- [ ] Keyboard only.
- [ ] Browser zoom at 200%.
- [ ] A narrow mobile-sized browser window.
- [ ] Reduced motion enabled.

Check:

- [ ] Focus remains visible.
- [ ] Every form control has a readable label.
- [ ] Validation identifies the field that needs attention.
- [ ] Loading, success, error, and degraded states are announced or visible.
- [ ] No action depends only on color.
- [ ] No important content becomes unreachable on a narrow screen.

- Status: [ ] Pass [ ] Fail [ ] Blocked
- Notes:
- Evidence filename:
- Defect or follow-up:

## 19. Run the automated acceptance commands

Manual observations do not replace automated checks. Run:

```bash
pnpm run local-stack:test
pnpm run stack:verify:smoke
pnpm run stack:verify:persistence
pnpm run test:browser
```

Record the result without pasting credentials or excessive logs:

| Command | Pass | Fail | Skipped | Notes |
| --- | --- | --- | --- | --- |
| `pnpm run local-stack:test` | [ ] | [ ] | [ ] | |
| `pnpm run stack:verify:smoke` | [ ] | [ ] | [ ] | |
| `pnpm run stack:verify:persistence` | [ ] | [ ] | [ ] | |
| `pnpm run test:browser` | [ ] | [ ] | [ ] | |

## Defect log

Record one row per distinct problem.

| ID | Journey | Severity | What happened | Expected result | Reproduction steps | Evidence | Retest |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MAN-001 |  |  |  |  |  |  | [ ] |
| MAN-002 |  |  |  |  |  |  | [ ] |
| MAN-003 |  |  |  |  |  |  | [ ] |

Suggested severities:

- **P0:** data loss, credential exposure, or the installation cannot operate.
- **P1:** a required booking or owner journey cannot complete.
- **P2:** the journey completes only with a confusing workaround.
- **P3:** cosmetic or minor usability issue.

## Final acceptance summary

### Counts

- Tests passed:
- Tests failed:
- Tests blocked:
- P0 defects:
- P1 defects:
- P2 defects:
- P3 defects:

### What worked well

-
-
-

### What was confusing or slow

-
-
-

### Missing real-world capability

-
-
-

### Final decision

- [ ] Accept this build for the final demonstration.
- [ ] Accept with documented P2/P3 follow-ups.
- [ ] Reject until P0/P1 defects are corrected and retested.

Decision notes:

Tester signature or initials:

Completed at:

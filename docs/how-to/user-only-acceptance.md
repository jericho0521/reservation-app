# Tests that require a real person or private account

This checklist contains only tests Codex cannot complete independently. These
tests require one or more of the following:

- your private provider credential;
- your physical phone or a second WhatsApp account;
- access to a real email inbox;
- subjective human usability judgment;
- an independent person who did not implement the platform.

Codex can test ordinary booking, reservation lifecycle, maintenance, Studio,
simulation, API, Docker restart, persistence, security boundaries, and
automated suites. You do not need to repeat those unless Codex asks you to
confirm a specific visual or usability result.

## Safety rules

- Never paste an API key, SMTP password, WhatsApp QR code, session value, login
  password, invitation link, or reservation-management link into chat.
- Do not include secrets in screenshots or recordings.
- Use fictional customer information.
- Record a missing private credential as **Blocked — not proven**, not passed.
- Store evidence under `tmp/`; do not commit it.

## Your test record

- Tester:
- Date:
- Commit SHA:
- Started at:
- Finished at:

| Test | Pass | Fail | Blocked | Not required |
| --- | --- | --- | --- | --- |
| Live AI provider and chat | [ ] | [ ] | [ ] | [ ] |
| Live WhatsApp through Baileys | [ ] | [ ] | [ ] | [ ] |
| Live SMTP email | [ ] | [ ] | [ ] | [ ] |
| Human usability review | [ ] | [ ] | [ ] | [ ] |
| Independent non-developer acceptance | [ ] | [ ] | [ ] | [ ] |

## 1. Configure and test a live AI model

You must perform the credential entry because Codex must not receive your API
key.

### Current provider limitation

The current settings page fixes the provider to **OpenAI**. The platform uses
the AI SDK internally, but the owner-facing page is not yet a general
multi-provider selector.

- For OpenAI, leave **Base URL** empty.
- An alternative endpoint must expose the supported OpenAI-compatible API.
- A native provider that is not OpenAI-compatible cannot currently be selected
  from this page.

### Save the model

1. Sign in as the owner.
2. Open
   <http://127.0.0.1:4300/admin/settings/ai>.
3. Enable **AI automation**.
4. Enter the exact model identifier available to your provider account.
5. Leave **Base URL** empty for OpenAI. Enter it only for a supported compatible
   endpoint.
6. Paste the API key into **API key**.
7. Press **Save AI settings**.
8. Reload the page.

Expected result:

- The page reports **AI provider settings saved**.
- It reports that a credential is stored.
- The original API key is never displayed again.
- The key does not appear in the URL, page source, screenshots, or logs.

### Test the provider connection

1. Press **Test connection**.
2. Wait for the bounded connection test.

Expected result:

- The page reports that the configured model responded successfully.
- A failure shows a safe error code or explanation without exposing the
  provider response or credential.

### Test a real AI booking conversation

1. Open
   <http://127.0.0.1:4400/apex-racing-demo/chat>
   in another tab.
2. Send:

   ```text
   I want to book an Apex GT Racing Session next Monday at 2:00 PM for one person.
   ```

3. Answer any follow-up questions using fictional customer information.
4. Confirm that the assistant presents a structured booking proposal.
5. Check that the proposal contains the correct service, date, time, and
   quantity.
6. Use the explicit confirmation action.
7. Open
   <http://127.0.0.1:4300/admin/reservations>
   and find the reservation.
8. Open
   <http://127.0.0.1:4300/admin/conversations>
   and find the conversation.

Expected result:

- The response comes from the configured live model.
- The model does not invent an unavailable slot.
- No reservation is created before explicit confirmation.
- The confirmed reservation appears in owner operations.
- The conversation and reservation are linked.

### Test fallback after credential revocation

Do this only after the live proof is complete:

1. Return to **AI provider**.
2. Press **Revoke API key**.
3. Confirm the page reports that the credential was revoked.
4. Reload the public chat.
5. Send another basic booking question.

Expected result:

- The API and public booking page remain available.
- Chat uses the deterministic fallback or reports a safe degraded state.
- System status reports AI as degraded without terminating the application.

### AI notes

- Model:
- Base URL type: [ ] OpenAI default [ ] Compatible custom endpoint
- Save result:
- Connection-test result:
- Proposal produced: [ ] Yes [ ] No
- Reservation confirmed: [ ] Yes [ ] No
- Fallback after revocation: [ ] Pass [ ] Fail [ ] Not tested
- Notes:
- Evidence filename:
- Defect:

## 2. Pair and test a real WhatsApp account

You must perform QR scanning and real message delivery because Codex cannot
operate your phone or WhatsApp account.

You need:

- one WhatsApp account acting as the business device;
- preferably a second WhatsApp account acting as the customer;
- the local Docker stack running;
- access to the owner console.

### Pair the business account

1. Sign in as the owner.
2. Open
   <http://127.0.0.1:4300/admin/settings/whatsapp>.
3. Confirm the WhatsApp card reports **Setup required** or another actionable
   disconnected state.
4. Press **Start QR pairing**.
5. Wait for **QR payload ready**.
6. On the business phone, open WhatsApp.
7. Open **Linked devices**.
8. Choose **Link a device**.
9. Scan the QR directly from the screen.
10. Keep the browser open until the session reports connected.

Expected result:

- The QR is rendered only on the private owner page.
- The pairing state changes to connected.
- The QR is not printed in the browser console, application logs, terminal, or
  support output.

Do not photograph or record the QR.

### Test real inbound and outbound delivery

1. From the customer WhatsApp account, message the paired business account:

   ```text
   I would like to book an Apex GT Racing Session next Monday at 2 PM.
   ```

2. Open
   <http://127.0.0.1:4300/admin/conversations>.
3. Find the WhatsApp conversation.
4. Confirm the real inbound message appears.
5. Continue the conversation until a booking proposal appears.
6. Explicitly confirm the proposal.
7. Verify the reservation appears in
   <http://127.0.0.1:4300/admin/reservations>.

Expected result:

- The inbound message appears once.
- The automated reply reaches the customer phone.
- The platform proposes only valid availability.
- Confirmation creates one reservation.
- The conversation is labelled WhatsApp, not simulation.

### Test staff takeover

1. Open the live WhatsApp conversation.
2. Press **Take over conversation**.
3. Confirm the page says **You are in control**.
4. From the customer phone, send:

   ```text
   Can a staff member help me?
   ```

5. Wait briefly and confirm no automated fallback reply is delivered.
6. Enter a fictional staff reply and press **Send as staff**.
7. Confirm the reply arrives on the customer phone.
8. Press **Resume AI automation**.
9. Send another customer message.
10. Confirm automation can respond again.

Expected result:

- Takeover suppresses automated replies.
- Staff delivery reaches the real phone.
- Resume restores automation without losing conversation history.

### Test encrypted session restoration

After the account is connected:

1. Tell Codex that pairing is complete, or restart the application containers
   yourself:

   ```bash
   docker compose restart reservation-api reservation-worker
   ```

2. Wait for the containers to become healthy.
3. Reload **WhatsApp setup**.
4. Confirm the session reconnects without showing a new QR.
5. Send another real inbound message.
6. Confirm it appears in the unified inbox and receives a reply.

Expected result:

- The linked session survives restart.
- The saved encrypted credentials restore the session.
- A second QR scan is not required.

### Test logout

Perform this only when you are ready to end the live test:

1. Press **Disconnect session**.
2. Confirm WhatsApp setup reports a disconnected or setup-required state.
3. Restart the worker.
4. Confirm the old session does not reconnect.
5. Confirm a new connection requires a new QR pairing.

Expected result:

- Logout revokes the stored session.
- Old encrypted session data cannot reconnect after logout.
- Reservation and conversation history remain available.

### WhatsApp notes

- Pairing result:
- Real inbound received: [ ] Yes [ ] No
- Automated reply delivered: [ ] Yes [ ] No
- Reservation confirmed: [ ] Yes [ ] No
- Takeover suppressed automation: [ ] Yes [ ] No
- Staff reply delivered: [ ] Yes [ ] No
- Reconnected after restart: [ ] Yes [ ] No
- Old session rejected after logout: [ ] Yes [ ] No
- Notes:
- Evidence filename, excluding QR:
- Defect:

## 3. Test live email delivery

This test is required only if email delivery is part of your final
demonstration or release claim. Codex cannot verify receipt in your private
inbox.

You need a real SMTP test account and access to the owner email inbox.

### Configure SMTP

1. Open
   <http://127.0.0.1:4300/admin/settings/email>.
2. Enable **Appointment email delivery**.
3. Enter:
   - SMTP host;
   - SMTP port;
   - from name;
   - transport security;
   - from address;
   - username and password when authentication is required.
4. Press **Save email settings**.
5. Reload the page and confirm the password is not displayed.

### Send and receive the test message

1. Press **Send test email**.
2. Check the owner inbox and spam folder.
3. Confirm the sender, subject, and body are understandable.
4. Confirm the message contains no internal token, stack trace, or service key.

### Test transactional delivery

1. Make a fictional public booking using an inbox you control.
2. Confirm the booking email arrives.
3. Invite a fictional staff account using another controlled inbox.
4. Confirm the invitation arrives and its one-time link works.
5. Request a password reset for the test account.
6. Confirm the reset message arrives and the link works once.

Expected result:

- Test and transactional messages reach the correct inbox.
- Credentials remain write-only.
- Invitation and reset links are private and expire or become unusable as
  designed.
- No real customer receives a test message.

### Email notes

- SMTP provider:
- Test message received: [ ] Yes [ ] No
- Booking confirmation received: [ ] Yes [ ] No
- Staff invitation received: [ ] Yes [ ] No
- Password reset received: [ ] Yes [ ] No
- Spam or delay observed:
- Notes:
- Evidence filename:
- Defect:

## 4. Perform the human usability review

Codex can check DOM structure, keyboard reachability, viewports, labels, and
automated accessibility rules. Only a person can judge whether the product is
understandable, trustworthy, and pleasant to use.

Complete these journeys without reading implementation code:

1. Sign in as an owner.
2. Find today's bookings.
3. Create and reschedule an appointment.
4. Publish a harmless Studio change.
5. Complete a customer booking on a phone-sized screen.
6. Take over and resume a conversation.
7. Find channel health and system status.

For each journey, answer:

- Did you know what to do next without guessing?
- Did the page explain why an action was disabled?
- Did success remain visible long enough to understand it?
- Did errors tell you how to recover?
- Did any term feel developer-oriented rather than business-oriented?
- Did you trust that pressing the main button would do what it claimed?
- Could you complete the journey using only the keyboard?
- Was the page readable at 200% zoom and on a real phone?

### Usability notes

- Most confusing page:
- Most useful page:
- Step where you hesitated:
- Term that needs rewriting:
- Missing recovery guidance:
- Mobile issue:
- Keyboard or screen-reader issue:
- Feature that made the product feel valuable:
- Feature that still felt like a demo:
- Overall usability score, 1–10:
- Evidence filename:
- Defect:

## 5. Arrange independent non-developer acceptance

This cannot be replaced by Codex or by you as the implementer. Ask someone who
has not worked on the code to try the product.

Give the tester only:

- the owner URL and temporary test credentials;
- the public booking URL;
- a short goal such as “configure and operate an appointment business”;
- the safety rule not to enter real customer information.

Ask the tester to complete:

1. Owner login.
2. Find today's reservations.
3. Create an appointment.
4. Publish a small customer-facing change.
5. Make a customer booking.
6. Find the booking in owner operations.
7. Use staff takeover in a simulated or live conversation.
8. Find analytics and system status.

Do not guide the tester unless they become blocked. Record where they needed
help; that is acceptance evidence, not tester failure.

### Independent acceptance notes

- Tester background:
- Completed without help:
- Required help:
- Time to first booking:
- Confusing terminology:
- Recovery attempts:
- Overall verdict: [ ] Pass [ ] Fail [ ] Blocked
- Tester comments:
- Evidence filename:

## What to report back to Codex

You only need to report:

1. **AI:** model, connection pass/fail, proposal pass/fail, and safe error text.
2. **WhatsApp:** pairing, inbound, outbound, takeover, restart, and logout
   pass/fail.
3. **Email:** test, confirmation, invitation, and reset delivery pass/fail.
4. **Usability:** confusing steps and screenshots without private information.
5. **Independent acceptance:** tasks completed, blockers, and verdict.

Do not send credentials, QR codes, private links, message identifiers, or real
contact information.

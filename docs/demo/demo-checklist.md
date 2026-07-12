# Final demonstration checklist

## Release revision

- [ ] Record accepted commit: `________________________`
- [ ] Confirm working tree is clean.
- [ ] Confirm the release-candidate gate in the six-week roadmap passes.
- [ ] Freeze feature changes 48 hours before submission.

## Environment

- [ ] Use a disposable database; verify the host before resetting.
- [ ] Run guarded `pnpm demo:reset` and `pnpm demo:verify`.
- [ ] Confirm API health, console, and all three flagship apps.
- [ ] Confirm owner credentials are available without displaying them.
- [ ] Confirm WhatsApp simulation works even if the live session is enabled.
- [ ] Close terminals, browser devtools, password managers, and notifications that could expose private data.

## Journey preflight

- [ ] Studio opens a deterministic draft and can preview/validate/publish.
- [ ] Racing booking has at least one available simulator and one visible maintenance constraint.
- [ ] WhatsApp simulation produces a proposal and explicit confirmation step.
- [ ] Staff takeover suppresses the next automated reply and staff reply is visible.
- [ ] Reservation, resource, channel, and analytics pages contain seeded evidence.
- [ ] Room and appointment tabs are loaded for the breadth proof.

## Presentation equipment

- [ ] Browser zoom is readable on the projector; desktop resolution and color mode are correct.
- [ ] Deployed walkthrough passes at 375px, 768px, desktop, keyboard-only, and 200% zoom.
- [ ] Slides, local URLs, hosted URLs, architecture document, and fallback runbook are pre-opened.
- [ ] Backup recording plays with network disabled and contains no credentials, QR data, or customer PII.
- [ ] Charger, display adapter, offline repository, database dump, and video are available.

## Timed rehearsal log

Do not mark a rehearsal complete unless the full script and fallback transition were performed.

| Run | Date | Duration | Blocker or overrun | Fix applied | Complete |
| --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  | [ ] |
| 2 |  |  |  |  | [ ] |
| 3 |  |  |  |  | [ ] |

## Screenshot and recording approval

- [ ] Capture only the approved states listed in `docs/demo/assets/README.md`.
- [ ] Inspect every capture for tenant secrets, QR payloads, email addresses, phone numbers, management tokens, and browser/terminal history.
- [ ] Record reviewer and approval date in the asset manifest.
- [ ] Record the backup video using deterministic simulation and test playback offline.

## Five-minute fallback

- [ ] If live WhatsApp fails, switch to simulation within 20 seconds.
- [ ] If hosted services fail, switch to the verified local stack.
- [ ] If the stack fails, use the approved recording and show automated evidence.
- [ ] Never debug secrets or scan a QR while screen sharing.

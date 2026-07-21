# Final demonstration checklist

## Release revision

- [x] Record accepted feature revision: `6302bb581c511666b7adba30f4d1167dfdf7b3ca`.
- [x] Confirm working tree is clean.
- [x] Confirm the release-candidate gate in the six-week roadmap passes.
- [ ] Freeze feature changes 48 hours before submission.

Feature freeze started at 2026-07-13 02:57:51 +08:00. The earliest eligible release-tag time is 2026-07-15 02:57:51 +08:00. The approved tag name is `v1.0.0-final`. Any feature or runtime-code change restarts the freeze; documentation-only sign-off records do not alter the accepted feature revision.

## Environment

- [x] Use a disposable database; verify the host before resetting.
- [x] Run guarded `pnpm demo:reset` and `pnpm demo:verify`.
- [x] Confirm API health, console, and all three flagship apps.
- [x] Confirm owner credentials are available without displaying them.
- [x] Confirm WhatsApp simulation works even if the live session is enabled.
- [ ] Close terminals, browser devtools, password managers, and notifications that could expose private data.

## Journey preflight

- [x] Studio opens a deterministic draft and can preview/validate/publish.
- [x] Racing booking has at least one available simulator and one visible maintenance constraint.
- [x] WhatsApp simulation produces a proposal and explicit confirmation step.
- [x] Staff takeover suppresses the next automated reply and staff reply is visible.
- [x] Reservation, resource, channel, and analytics pages contain seeded evidence.
- [x] Room and appointment tabs are loaded for the breadth proof.

## Presentation equipment

- [ ] Browser zoom is readable on the projector; desktop resolution and color mode are correct.
- [ ] Deployed walkthrough passes at 375px, 768px, desktop, keyboard-only, and 200% zoom.
- [ ] Slides, local URLs, hosted URLs, architecture document, and fallback runbook are pre-opened.
- [x] Backup recording plays with network disabled and contains no credentials, QR data, or customer PII.
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
- [x] Inspect every capture for tenant secrets, QR payloads, email addresses, phone numbers, management tokens, and browser/terminal history.
- [ ] Record reviewer and approval date in the asset manifest.
- [x] Record the backup video using deterministic simulation and test playback offline.

### Approved backup recording

- Candidate revision: `d3f3d3e6d934dd8f282b83c56463a5bcebddbc8c`.
- Format: H.264 MP4, 1440×900, 30 fps, 69 seconds.
- Content: command center, eight-preset Studio, maintenance-aware racing selection, simulated staff takeover, analytics, rooms, and appointments.
- Safety proof: viewport-only captures were visually inspected; OCR found no email, phone, API key, bearer token, management token, QR payload, WhatsApp identifier, localhost URL, or loopback address.
- Playback proof: `ffmpeg` decoded every frame without an error; SHA-256 is `e82db0350f4c8614a7a6f6b8dc5b4a29070347d942d3e36f3e4a3d39079d631c`.
- Historical recording: removed from the tracked tree; record current evidence under `tmp/`.
- Reviewer: project owner.
- Approval date: 2026-07-13.
- Status: approved for the deterministic presentation fallback. Source frames remain outside `docs/demo/assets/` because screenshot approval is tracked separately.

## Five-minute fallback

- [ ] If live WhatsApp fails, switch to simulation within 20 seconds.
- [ ] If hosted services fail, switch to the verified local stack.
- [ ] If the stack fails, use the current candidate recording from `tmp/` and show automated evidence.
- [ ] Never debug secrets or scan a QR while screen sharing.

# Phase 6 Release-Drill Proof Template

Status: **NOT RUN**

This template is not release evidence. Copy it into a release-specific evidence
directory only after the approved release drills have run against an isolated
proof environment.

## Release identity

- Release version:
- Commit SHA:
- Migration version:
- Immutable image digests verified:
- Proof started at (UTC):
- Proof completed at (UTC):

## Failure and recovery matrix

- API restart with active session:
- Worker restart with leased job:
- AI provider unavailable:
- WhatsApp disconnected:
- SMTP delivery rejected:
- Database stopped:
- Low disk simulated:
- Stale slot submitted:
- Duplicate idempotency key submitted:
- Target upgrade readiness failed:

For each drill, record only `PASS` or `FAIL`, the failed gate when applicable,
and redacted operator notes. A passing drill must demonstrate the expected
degraded behavior, successful recovery, and preserved data integrity.

## Concurrency proof

- Competing requests submitted (`50` expected):
- Reservations created (`1` expected):
- Duplicate responses identical:
- Notifications created (`1` expected):
- Stuck proposal claims (`0` expected):

## Security-boundary proof

- Anonymous, owner, staff, and service route matrix passed:
- CSRF, exact CORS, cookie, rate, body, timeout, and redaction controls passed:
- Database and PostgREST remained private:
- Public ports restricted to `22`, `80`, and `443`:

## Backup, restore, and upgrade recovery

- Backup verified:
- Clean restore completed:
- Stable identifiers matched:
- Record counts matched:
- Healthy upgrade passed:
- Failed target blocked from traffic:
- Previous release recovered:

## Verdict

- Result (`PASS` or `FAIL`):
- Failed gate, if any:
- Redacted operator notes:

Do not record hostnames, IP addresses, credentials, cookies, tokens, QR
payloads, customer details, contact details, or raw response bodies in this
file.

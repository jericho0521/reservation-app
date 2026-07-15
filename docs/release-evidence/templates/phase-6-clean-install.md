# Phase 6 Clean-Install Proof Template

Status: **NOT RUN**

This template is not release evidence. Copy it into a release-specific evidence
directory only after the clean-install proof has run on an approved disposable
host.

## Release identity

- Release version:
- Commit SHA:
- Migration version:
- API image digest:
- Worker image digest:
- Console image digest:
- Booking image digest:
- Caddy image digest:

## Disposable host

- Redacted host hash:
- Proof started at (UTC):
- Proof completed at (UTC):
- Ubuntu version (`22.04` or `24.04`):
- Release signatures verified:

## Gates

- Readiness passed:
- Public ports restricted to `22`, `80`, and `443`:
- Initial owner created:
- Setup token replay rejected:
- Demo data absent:
- Appointment business configured and published:
- Public booking created a reservation:

## Verdict

- Result (`PASS` or `FAIL`):
- Failed gate, if any:
- Redacted operator notes:

Do not record hostnames, IP addresses, setup URLs, credentials, cookies, QR
payloads, customer details, contact details, or raw response bodies in this
file.

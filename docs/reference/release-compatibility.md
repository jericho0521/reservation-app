# Release compatibility reference

The current source candidate is `0.2.0` with required migration `000043`. It remains a candidate until independent full-day acceptance evidence is completed and accepted; the checked-in pending record is not release proof.

## Compatibility rules

- Install and upgrade only from a verified release manifest with digest-qualified API, worker, console, booking, and tools images.
- Never use `latest` or combine images from different releases.
- Database migrations are ordered and forward-applied. The migration index and ledger checksums are release inputs, not operator-editable state.
- An upgrade manifest declares its minimum source version, required migration, and whether restart rollback is compatible.
- A downgrade is rejected unless the target explicitly declares downgrade compatibility and the operator chooses the matching flag.
- If a migration makes image rollback unsafe, recovery requires the verified pre-upgrade backup and explicit restore acknowledgement.

## Public API and SDK

The `/v1` API is the browser and integration boundary. Additive response fields are compatible; consumers must ignore fields they do not use. Removing or changing the meaning of a field, status, scope, or route requires a new declared compatibility policy and coordinated SDK release. Frontends must not depend on database tables or server-only packages.

## Release decision evidence

A production candidate is releasable only when build/signature checks, clean-install verification, restore and upgrade drills, browser journeys, security checks, and the independent eight-hour acceptance record agree on the same release, commit, migration, and image digests. See [the acceptance template](../release-evidence/full-day-acceptance-template.md). A pending, unsigned, short, or redacted-without-structure record must fail the strict validator.

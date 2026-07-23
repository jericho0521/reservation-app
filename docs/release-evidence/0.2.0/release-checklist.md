# Release 0.2.0 Checklist

Status: **Blocked pending external release evidence.**

## Automated repository gates

- [x] Complete CI gate passes on the exact candidate commit.
- [x] Browser discovery and available local-stack journeys pass.
- [ ] Migration bundle is current through `000043`; acceptance evidence must be regenerated for this candidate.
- [x] Release manifest, signature harness, security, recovery, documentation, and evidence validators pass.

## Required observed evidence

- [ ] Five GHCR images are published by the tag workflow and referenced by exact digest.
- [ ] Cosign signatures, SLSA provenance, SPDX SBOM attestations, and bundle checksums verify independently.
- [ ] Clean supported Ubuntu installation proof passes from published assets.
- [ ] Backup restore and successful plus failed-readiness upgrade drills pass.
- [ ] Live SMTP, AI provider, and Baileys pairing/reconnect checks are recorded safely.
- [ ] An independent non-developer operator completes the signed eight-hour acceptance run.
- [ ] The acceptance-run backup restores successfully.

Do not check an observed-evidence item from a simulation, unit test, template, or locally built mutable image. Do not create `v0.2.0` until every item above is backed by release-candidate evidence tied to one commit and the five published image digests.

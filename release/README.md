# Reservation Platform Release Bundle

This directory is the source layout for a published self-hosted release bundle. A release workflow replaces the Compose and Caddy source references with the exact repository files, adds the observed digest manifest, signature verifier, operations quick start, and `SHA256SUMS`, then publishes one archive for an exact semantic version.

No release in the source tree is published or signature-verified. Only a GitHub release archive whose checksum, manifest, five image signatures, provenance attestations, and SBOM attestations all verify is a supported release artifact.

Install from an extracted published bundle:

```sh
sudo ./install.sh --domain booking.example.com
```

The wrapper validates the bundle and digest-qualified image evidence before delegating to `scripts/production/install.sh`. It derives the release version from the verified manifest and does not accept an image tag from the operator.

Required bundle entries include `release-manifest.json`, `SHA256SUMS`, `verify-signatures.sh`, the production Compose/Caddy configuration, and the `scripts/production` installer assets.

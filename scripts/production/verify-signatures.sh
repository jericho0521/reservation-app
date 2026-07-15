#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT=${RELEASE_ROOT:-$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)}
MANIFEST=${1:-$ROOT/release-manifest.json}
MANIFEST_TOOL=$SCRIPT_DIR/release-manifest.mjs
[ -f "$MANIFEST_TOOL" ] || MANIFEST_TOOL=$ROOT/scripts/production/release-manifest.mjs
COSIGN=${COSIGN_BIN:-cosign}
REPOSITORY=${GITHUB_REPOSITORY:-jericho0521/reservation-app}

fail() {
  printf '%s\n' "signature verification: $1" >&2
  exit 65
}

command -v "$COSIGN" >/dev/null 2>&1 || fail "cosign is required"
node "$MANIFEST_TOOL" --check-published --root "$ROOT" --manifest "$MANIFEST" >/dev/null \
  || fail "published release manifest is invalid"

version=$(node -e 'const fs=require("node:fs");const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(value.version)' "$MANIFEST")
identity="https://github.com/$REPOSITORY/.github/workflows/release.yml@refs/tags/v$version"
issuer="https://token.actions.githubusercontent.com"

references=$(node "$MANIFEST_TOOL" --print-image-digests --root "$ROOT" --manifest "$MANIFEST") \
  || fail "published release image references are invalid"
printf '%s\n' "$references" |
while IFS="$(printf '\t')" read -r component reference; do
  [ -n "$component" ] && [ -n "$reference" ] || fail "manifest emitted an invalid image reference"
  "$COSIGN" verify --certificate-identity "$identity" --certificate-oidc-issuer "$issuer" "$reference" >/dev/null \
    || fail "$component image signature is invalid"
  "$COSIGN" verify-attestation --type slsaprovenance --certificate-identity "$identity" --certificate-oidc-issuer "$issuer" "$reference" >/dev/null \
    || fail "$component provenance attestation is invalid"
  "$COSIGN" verify-attestation --type spdxjson --certificate-identity "$identity" --certificate-oidc-issuer "$issuer" "$reference" >/dev/null \
    || fail "$component SBOM attestation is invalid"
done
unset references

printf '%s\n' "Verified signatures, provenance, and SBOM attestations for five release images."

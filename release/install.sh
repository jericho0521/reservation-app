#!/bin/sh

set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MANIFEST=$ROOT/release-manifest.json

fail() {
  printf '%s\n' "release installer: $1" >&2
  exit 64
}

[ -f "$MANIFEST" ] && [ ! -L "$MANIFEST" ] || fail "release-manifest.json is missing or unsafe"
[ -x "$ROOT/verify-signatures.sh" ] || fail "verify-signatures.sh is missing or not executable"
[ -x "$ROOT/scripts/production/install.sh" ] || fail "production installer is missing or not executable"

RELEASE_ROOT=$ROOT "$ROOT/verify-signatures.sh" "$MANIFEST" || fail "release signature verification failed"
release=$(node -e 'const fs=require("node:fs");const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(value.version)' "$MANIFEST")

exec "$ROOT/scripts/production/install.sh" "$@" --release "$release"

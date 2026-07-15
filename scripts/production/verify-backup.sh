#!/bin/sh

set -eu

fail() {
  printf '%s\n' "verify-backup: $1" >&2
  exit 64
}

archive=
recovery_key=
maximum_migration=${RESERVATION_MAXIMUM_MIGRATION:-$(node /opt/reservation-tools/scripts/production/backup-manifest.mjs latest --index /opt/reservation-tools/packages/database/migrations/supabase/migration-index.json)}
while [ "$#" -gt 0 ]; do
  case $1 in
    --archive) [ "$#" -ge 2 ] || fail "--archive requires a value"; archive=$2; shift 2 ;;
    --recovery-key) [ "$#" -ge 2 ] || fail "--recovery-key requires a value"; recovery_key=$2; shift 2 ;;
    --maximum-migration) [ "$#" -ge 2 ] || fail "--maximum-migration requires a value"; maximum_migration=$2; shift 2 ;;
    *) fail "usage: verify-backup.sh --archive <file.tar.age> --recovery-key <file> [--maximum-migration <000000>]" ;;
  esac
done

[ -n "$archive" ] && [ -n "$recovery_key" ] || fail "archive and recovery key are required"
[ ! -L "$archive" ] && [ -f "$archive" ] || fail "archive must be a regular file"
[ ! -L "$archive.sha256" ] && [ -f "$archive.sha256" ] || fail "archive checksum sidecar is required"
[ ! -L "$recovery_key" ] && [ -f "$recovery_key" ] || fail "recovery key must be a regular file"

temporary=$(mktemp -d "${TMPDIR:-/tmp}/reservation-backup-verify.XXXXXX")
chmod 0700 "$temporary"
cleanup() { rm -rf "$temporary"; }
trap cleanup 0 HUP INT TERM

(cd "$(dirname "$archive")" && sha256sum -c "$(basename "$archive").sha256") >/dev/null \
  || fail "archive checksum does not match sidecar"
AGE_PASSPHRASE=$(cat "$recovery_key") age --decrypt --output "$temporary/backup.tar" "$archive" \
  || fail "archive decryption failed"
unset AGE_PASSPHRASE

tar -tf "$temporary/backup.tar" | while IFS= read -r entry; do
  case $entry in
    /*|../*|*/../*|*/..) fail "archive contains an unsafe path" ;;
  esac
done
tar -xf "$temporary/backup.tar" -C "$temporary" --no-same-owner
rm -f "$temporary/backup.tar"
available_kib=$(df -Pk "$temporary" | awk 'NR == 2 { print $4 }')
available_bytes=$((available_kib * 1024))
node /opt/reservation-tools/scripts/production/backup-manifest.mjs verify \
  --root "$temporary" \
  --maximum-migration "$maximum_migration" \
  --available-disk-bytes "$available_bytes"

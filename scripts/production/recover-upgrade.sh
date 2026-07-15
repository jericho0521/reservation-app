#!/bin/sh

set -eu

fail() { printf '%s\n' "recover-upgrade: $1" >&2; exit 64; }

archive=
confirmation=
while [ "$#" -gt 0 ]; do
  case $1 in
    --archive) [ "$#" -ge 2 ] || fail "--archive requires a value"; archive=$2; shift 2 ;;
    --confirm-restore) [ "$#" -ge 2 ] || fail "--confirm-restore requires a value"; confirmation=$2; shift 2 ;;
    *) fail "usage: recover-upgrade.sh --archive </backups/file.tar.age> --confirm-restore <installation-id>" ;;
  esac
done
[ -n "$archive" ] && [ -n "$confirmation" ] || fail "archive and confirmation are required"
exec /opt/reservation-tools/scripts/production/restore.sh \
  --archive "$archive" --confirm-restore "$confirmation"

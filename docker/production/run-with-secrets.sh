#!/bin/sh

set -eu

fail() {
  printf '%s\n' "run-with-secrets: $1" >&2
  exit 64
}

[ "$#" -ge 3 ] || fail "usage: run-with-secrets <allowlist> -- <command> [args...]"

allowlist=$1
shift
[ "$1" = "--" ] || fail "the allowlist must be followed by --"
shift
[ "$#" -gt 0 ] || fail "a child command is required"

[ ! -L "$allowlist" ] && [ -f "$allowlist" ] || fail "allowlist must be a regular file"

secrets_directory=${RESERVATION_SECRETS_DIR:-/run/reservation-secrets}
[ ! -L "$secrets_directory" ] && [ -d "$secrets_directory" ] || fail "secret directory must be a regular directory"

seen_variables=:
while IFS= read -r mapping || [ -n "$mapping" ]; do
  case "$mapping" in
    ""|'#'*) continue ;;
    *=*) variable=${mapping%%=*}; file_name=${mapping#*=} ;;
    *) fail "allowlist contains a malformed mapping" ;;
  esac

  case "$variable" in
    [A-Z_]*) ;;
    *) fail "allowlist contains an invalid variable name" ;;
  esac
  case "$variable" in
    *[!A-Z0-9_]*) fail "allowlist contains an invalid variable name" ;;
  esac
  case "$seen_variables" in
    *:"$variable":*) fail "allowlist contains a duplicate variable" ;;
  esac

  case "$file_name" in
    ""|-*|*-|*[!a-z0-9-]*) fail "allowlist contains an invalid secret file name" ;;
  esac

  secret_path=$secrets_directory/$file_name
  [ ! -L "$secret_path" ] && [ -f "$secret_path" ] || fail "mapped secret must be a regular file"
  secret_value=$(/bin/cat "$secret_path")
  [ -n "$secret_value" ] || fail "mapped secret must not be empty"
  export "$variable=$secret_value"
  seen_variables=$seen_variables$variable:
done < "$allowlist"

run_as_uid=${RESERVATION_RUN_AS_UID:-}
run_as_gid=${RESERVATION_RUN_AS_GID:-}
if [ -n "$run_as_uid$run_as_gid" ]; then
  [ -n "$run_as_uid" ] && [ -n "$run_as_gid" ] || fail "run-as UID and GID must be supplied together"
  case "$run_as_uid" in
    [1-9]*) ;;
    *) fail "run-as UID and GID must be canonical positive integers" ;;
  esac
  case "$run_as_uid" in
    *[!0-9]*) fail "run-as UID and GID must be canonical positive integers" ;;
  esac
  case "$run_as_gid" in
    [1-9]*) ;;
    *) fail "run-as UID and GID must be canonical positive integers" ;;
  esac
  case "$run_as_gid" in
    *[!0-9]*) fail "run-as UID and GID must be canonical positive integers" ;;
  esac
  [ "$(/usr/bin/id -u)" = "0" ] || fail "only root can load protected secrets before dropping privileges"
  su_exec=${RESERVATION_SU_EXEC_PATH:-/sbin/su-exec}
  case "$su_exec" in
    /*) ;;
    *) fail "su-exec path must be absolute" ;;
  esac
  [ ! -L "$su_exec" ] && [ -f "$su_exec" ] && [ -x "$su_exec" ] || fail "su-exec is unavailable"
  exec "$su_exec" "$run_as_uid:$run_as_gid" "$@"
fi

if [ "$(/usr/bin/id -u)" = "0" ] && [ "${RESERVATION_ALLOW_ROOT_EXEC:-}" != "true" ]; then
  fail "root execution requires an explicit run-as UID/GID"
fi

exec "$@"

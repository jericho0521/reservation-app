#!/bin/sh

set -eu

fail() { printf '%s\n' "upgrade: $1" >&2; exit 64; }

INSTALL_DIR=${RESERVATION_INSTALL_DIR:-${RESERVATION_INSTALLATION_DIRECTORY:-/opt/reservation-platform}}
config_directory=${RESERVATION_PRODUCTION_CONFIG_DIR:-/run/reservation-config}
target_manifest=
allow_downgrade=false
restore_declared=false
while [ "$#" -gt 0 ]; do
  case $1 in
    --manifest) [ "$#" -ge 2 ] || fail "--manifest requires a value"; target_manifest=$2; shift 2 ;;
    --allow-compatible-downgrade) allow_downgrade=true; shift ;;
    --restore-declared) restore_declared=true; shift ;;
    *) fail "usage: upgrade.sh --manifest <release.json> [--restore-declared] [--allow-compatible-downgrade]" ;;
  esac
done
[ "$(id -u)" -eq 0 ] || fail "run upgrade as root"
[ -n "$target_manifest" ] && [ ! -L "$target_manifest" ] && [ -f "$target_manifest" ] || fail "target manifest must be a regular file"
[ ! -L "$INSTALL_DIR" ] && [ -d "$INSTALL_DIR" ] || fail "installation directory is unavailable"
release_file=$INSTALL_DIR/release.env
[ ! -L "$release_file" ] && [ -f "$release_file" ] || fail "release.env is unavailable"
current_release=$(sed -n 's/^RESERVATION_RELEASE=//p' "$release_file")
domain=$(sed -n 's/^RESERVATION_DOMAIN=//p' "$release_file")
[ -n "$current_release" ] && [ -n "$domain" ] || fail "current release metadata is invalid"

compose_with() {
  env_file=$1
  shift
  docker compose --project-directory "$INSTALL_DIR" --env-file "$env_file" \
    -f "$INSTALL_DIR/compose.production.yml" --profile operations "$@"
}

available_kib=$(df -Pk "$INSTALL_DIR" | awk 'NR == 2 { print $4 }')
available_bytes=$((available_kib * 1024))
required_bytes=$((5 * 1024 * 1024 * 1024))
supported_migration=$(node /opt/reservation-tools/scripts/production/backup-manifest.mjs latest \
  --index /opt/reservation-tools/packages/database/migrations/supabase/migration-index.json)
validation_flags=
[ "$restore_declared" = "true" ] && validation_flags="$validation_flags --restore-declared"
[ "$allow_downgrade" = "true" ] && validation_flags="$validation_flags --allow-compatible-downgrade"
# shellcheck disable=SC2086
plan=$(node /opt/reservation-tools/scripts/production/upgrade-plan.mjs \
  validate --manifest "$target_manifest" --current "$current_release" \
  --backup-status verified \
  --available-disk-bytes "$available_bytes" --required-disk-bytes "$required_bytes" \
  --maximum-migration "$supported_migration" $validation_flags)
target_release=$(printf '%s' "$plan" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
rollback_compatible=$(printf '%s' "$plan" | sed -n 's/.*"rollbackCompatible":\(true\|false\).*/\1/p')
[ -n "$target_release" ] && [ -n "$rollback_compatible" ] || fail "validated target metadata is unavailable"

backup_output=$(/opt/reservation-tools/scripts/production/backup.sh)
backup_archive=${backup_output##*: }
case $backup_archive in /backups/*.tar.age) ;; *) fail "verified pre-upgrade backup was not produced" ;; esac
backup_name=${backup_archive##*/}
backup_id=$(compose_with "$release_file" exec -T reservation-db psql -U postgres -d reservation -Atq \
  --set archive="$backup_name" \
  -c "select id from public.platform_backup_records where archive_name = :'archive' and status = 'verified';" \
  | grep -E '^[a-f0-9-]{36}$' | tail -n 1)
[ -n "$backup_id" ] || fail "verified pre-upgrade backup record is unavailable"

next_release=$INSTALL_DIR/.release.env.next
node /opt/reservation-tools/scripts/production/upgrade-plan.mjs \
  render --manifest "$target_manifest" --domain "$domain" > "$next_release"
chmod 0600 "$next_release"
previous_release=$INSTALL_DIR/.release.env.previous
cp "$release_file" "$previous_release"
chmod 0600 "$previous_release"

upgrade_record=$(compose_with "$release_file" exec -T reservation-db psql -U postgres -d reservation -Atq \
  --set current="$current_release" --set target="$target_release" --set backup="$backup_id" \
  -c "select (public.record_platform_upgrade(:'current', :'target', :'backup'::uuid)).id;" \
  | grep -E '^[a-f0-9-]{36}$' | tail -n 1)
[ -n "$upgrade_record" ] || fail "upgrade record could not be created"
rollback_target() {
  status=$?
  trap - 0 HUP INT TERM
  target_environment=$next_release
  [ -f "$target_environment" ] || target_environment=$release_file
  compose_with "$target_environment" stop reservation-edge reservation-console reservation-booking reservation-api reservation-worker reservation-rest >/dev/null 2>&1 || true
  compose_with "$release_file" exec -T reservation-db psql -U postgres -d reservation -q -c \
    "update public.platform_upgrade_records set status = 'failed', error_code = 'readiness_failed', completed_at = now() where id = '$upgrade_record' and status = 'started';" >/dev/null 2>&1 || true
  if [ "$rollback_compatible" = "true" ]; then
    install -m 0644 "$previous_release" "$config_directory/release.env" >/dev/null 2>&1 || true
    install -m 0640 "$previous_release" "$release_file" >/dev/null 2>&1 || true
    compose_with "$previous_release" up -d --no-deps reservation-rest reservation-api reservation-worker reservation-console reservation-booking reservation-edge >/dev/null 2>&1 || true
    compose_with "$previous_release" exec -T reservation-db psql -U postgres -d reservation -q -c \
      "update public.platform_upgrade_records set status = 'rolled_back', completed_at = now() where id = '$upgrade_record' and status = 'failed';" >/dev/null 2>&1 || true
  else
    printf '%s\n' "upgrade: target is not rollback-compatible; public traffic remains stopped. Run recover-upgrade.sh with $backup_archive." >&2
  fi
  rm -f "$next_release"
  exit "$status"
}
trap rollback_target 0 HUP INT TERM

compose_with "$next_release" pull
compose_with "$release_file" stop reservation-edge reservation-console reservation-booking reservation-api reservation-worker
compose_with "$next_release" run --rm --no-deps reservation-migrate
compose_with "$next_release" up -d --no-deps reservation-rest reservation-api reservation-worker reservation-console reservation-booking

attempt=0
while :; do
  target_ready=true
  for service in reservation-api reservation-worker reservation-console reservation-booking; do
    container_id=$(compose_with "$next_release" ps -q "$service")
    [ -n "$container_id" ] || fail "target $service container is unavailable"
    health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container_id")
    [ "$health" != "unhealthy" ] || fail "target $service failed readiness"
    [ "$health" = "healthy" ] || target_ready=false
  done
  [ "$target_ready" = "true" ] && break
  attempt=$((attempt + 1))
  [ "$attempt" -lt 60 ] || fail "target service readiness timed out"
  sleep 3
done
compose_with "$next_release" up -d --no-deps reservation-edge
setup_token=$(cat "$config_directory/setup-token")
printf '%s\n' "$setup_token" | node /opt/reservation-tools/scripts/production/smoke.mjs \
  --origin "https://$domain" --setup-token-stdin
install -m 0644 "$next_release" "$config_directory/.release.env.upgrade"
mv "$config_directory/.release.env.upgrade" "$config_directory/release.env"
mv "$next_release" "$release_file"
compose_with "$release_file" exec -T reservation-db psql -U postgres -d reservation -q -c \
  "update public.platform_upgrade_records set status = 'healthy', completed_at = now() where id = '$upgrade_record' and status = 'started';" >/dev/null
rm -f "$previous_release"
trap - 0 HUP INT TERM
printf '%s\n' "Upgrade to $target_release is healthy."

#!/bin/sh

set -eu

fail() { printf '%s\n' "restore: $1" >&2; exit 64; }

archive=
confirmation=
config_directory=${RESERVATION_PRODUCTION_CONFIG_DIR:-/run/reservation-config}
whatsapp_directory=${RESERVATION_WHATSAPP_SESSION_DIRECTORY:-/run/reservation-whatsapp-sessions}
installation_directory=${RESERVATION_INSTALLATION_DIRECTORY:-/opt/reservation-installation}
database_url=${RESERVATION_DATABASE_URL:-postgresql://postgres@reservation-db:5432/reservation}
while [ "$#" -gt 0 ]; do
  case $1 in
    --archive) [ "$#" -ge 2 ] || fail "--archive requires a value"; archive=$2; shift 2 ;;
    --confirm-restore) [ "$#" -ge 2 ] || fail "--confirm-restore requires a value"; confirmation=$2; shift 2 ;;
    *) fail "usage: restore.sh --archive <file.tar.age> --confirm-restore <installation-id>" ;;
  esac
done
[ -n "$archive" ] && [ -n "$confirmation" ] || fail "archive and confirmation are required"

temporary=$(mktemp -d "${TMPDIR:-/tmp}/reservation-restore.XXXXXX")
chmod 0700 "$temporary"
previous_database="reservation_previous_$$"
database_swapped=false
services_stopped=false
completed=false
cleanup() {
  status=$?
  if [ "$database_swapped" = "true" ] && [ "$completed" != "true" ]; then
    printf '%s\n' "restore: restore failed; rolling back to retained database and protected state" >&2
    rollback_restore
  fi
  rm -rf "$temporary"
  unset PGPASSWORD AGE_PASSPHRASE
  exit "$status"
}
trap cleanup 0 HUP INT TERM

(cd "$(dirname "$archive")" && sha256sum -c "$(basename "$archive").sha256") >/dev/null || fail "archive checksum does not match"
AGE_PASSPHRASE=$(cat "$config_directory/backup-recovery-key")
export AGE_PASSPHRASE
age --decrypt --output "$temporary/backup.tar" "$archive" || fail "archive decryption failed"
unset AGE_PASSPHRASE
tar -tf "$temporary/backup.tar" | while IFS= read -r entry; do case $entry in /*|../*|*/../*|*/..) fail "archive contains an unsafe path" ;; esac; done
tar -xf "$temporary/backup.tar" -C "$temporary" --no-same-owner
rm -f "$temporary/backup.tar"
available_kib=$(df -Pk "$temporary" | awk 'NR == 2 { print $4 }')
maximum_migration=$(node /opt/reservation-tools/scripts/production/backup-manifest.mjs latest \
  --index /opt/reservation-tools/packages/database/migrations/supabase/migration-index.json)
node /opt/reservation-tools/scripts/production/backup-manifest.mjs verify --root "$temporary" \
  --maximum-migration "$maximum_migration" --available-disk-bytes "$((available_kib * 1024))"
archive_installation=$(node -e "const m=JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')); process.stdout.write(m.installationId)" "$temporary/manifest.json")
[ "$archive_installation" = "$confirmation" ] || fail "confirmation does not match the backup installation"

compose() { docker compose --project-directory "$installation_directory" --env-file "$installation_directory/release.env" -f "$installation_directory/compose.production.yml" "$@"; }
rollback_restore() {
  compose stop reservation-edge reservation-console reservation-booking reservation-api reservation-worker reservation-rest >/dev/null 2>&1 || true
  previous_exists=$(psql "${database_url%/reservation}/postgres" --no-psqlrc --tuples-only --no-align --set previous="$previous_database" \
    --command "select exists(select 1 from pg_database where datname = :'previous');" 2>/dev/null || printf false)
  if [ "$previous_exists" = "t" ]; then
    psql "${database_url%/reservation}/postgres" --no-psqlrc --set ON_ERROR_STOP=1 --set previous="$previous_database" <<'SQL' >/dev/null
select pg_terminate_backend(pid) from pg_stat_activity where datname = 'reservation' and pid <> pg_backend_pid();
drop database if exists reservation;
alter database :"previous" rename to reservation;
SQL
  fi
  if [ -d "$temporary/previous-keys" ]; then
    install -m 0600 "$temporary/previous-keys/installation-id" "$config_directory/installation-id"
    install -m 0600 "$temporary/previous-keys/installation-master-key" "$config_directory/installation-master-key"
    install -m 0600 "$temporary/previous-keys/internal-service-key" "$config_directory/internal-service-key"
    install -m 0600 "$temporary/previous-keys/whatsapp-session-key" "$config_directory/whatsapp-session-key"
    find "$whatsapp_directory" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp -a "$temporary/previous-whatsapp/." "$whatsapp_directory/"
  fi
  compose run --rm reservation-config >/dev/null 2>&1 || true
  compose up -d --no-deps reservation-rest reservation-api reservation-worker reservation-console reservation-booking reservation-edge >/dev/null 2>&1 || true
  database_swapped=false
}
PGPASSWORD=$(cat "$config_directory/database-password")
export PGPASSWORD
mkdir -m 0700 "$temporary/previous-keys" "$temporary/previous-whatsapp"
install -m 0600 "$config_directory/installation-id" "$temporary/previous-keys/installation-id"
install -m 0600 "$config_directory/installation-master-key" "$temporary/previous-keys/installation-master-key"
install -m 0600 "$config_directory/internal-service-key" "$temporary/previous-keys/internal-service-key"
install -m 0600 "$config_directory/whatsapp-session-key" "$temporary/previous-keys/whatsapp-session-key"
cp -a "$whatsapp_directory/." "$temporary/previous-whatsapp/"
compose stop reservation-edge reservation-console reservation-booking reservation-api reservation-worker reservation-rest
services_stopped=true
database_swapped=true
psql "${database_url%/reservation}/postgres" --no-psqlrc --set ON_ERROR_STOP=1 --set previous="$previous_database" <<'SQL'
select pg_terminate_backend(pid) from pg_stat_activity where datname = 'reservation' and pid <> pg_backend_pid();
alter database reservation rename to :"previous";
create database reservation;
SQL
pg_restore "$database_url" --clean --if-exists --no-owner --no-privileges "$temporary/database.dump"

mkdir -p "$config_directory" "$whatsapp_directory"
install -m 0600 "$temporary/secrets/installation-id" "$config_directory/installation-id"
install -m 0600 "$temporary/secrets/installation-master-key" "$config_directory/installation-master-key"
install -m 0600 "$temporary/secrets/internal-service-key" "$config_directory/internal-service-key"
install -m 0600 "$temporary/secrets/whatsapp-session-key" "$config_directory/whatsapp-session-key"
find "$whatsapp_directory" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
cp -a "$temporary/whatsapp/." "$whatsapp_directory/"
compose run --rm reservation-config
compose up -d --no-deps reservation-rest reservation-api reservation-worker reservation-console reservation-booking reservation-edge
domain=$(sed -n 's/^RESERVATION_DOMAIN=//p' "$config_directory/release.env")
if ! node - "$domain" <<'NODE'
const domain = process.argv[2];
const deadline = Date.now() + 180_000;
let ready = false;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`https://${domain}/v1/health/ready`, { signal: AbortSignal.timeout(10_000) });
    if (response.ok) { ready = true; break; }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 3_000));
}
if (!ready) process.exit(1);
const home = await fetch(`https://${domain}/`, { signal: AbortSignal.timeout(10_000) });
if (!home.ok) process.exit(1);
NODE
then
  compose stop reservation-edge reservation-console reservation-booking reservation-api reservation-worker reservation-rest
  psql "${database_url%/reservation}/postgres" --no-psqlrc --set ON_ERROR_STOP=1 --set previous="$previous_database" <<'SQL'
select pg_terminate_backend(pid) from pg_stat_activity where datname = 'reservation' and pid <> pg_backend_pid();
drop database reservation;
alter database :"previous" rename to reservation;
SQL
  install -m 0600 "$temporary/previous-keys/installation-master-key" "$config_directory/installation-master-key"
  install -m 0600 "$temporary/previous-keys/installation-id" "$config_directory/installation-id"
  install -m 0600 "$temporary/previous-keys/internal-service-key" "$config_directory/internal-service-key"
  install -m 0600 "$temporary/previous-keys/whatsapp-session-key" "$config_directory/whatsapp-session-key"
  find "$whatsapp_directory" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  cp -a "$temporary/previous-whatsapp/." "$whatsapp_directory/"
  compose run --rm reservation-config
  compose up -d reservation-rest reservation-api reservation-worker reservation-console reservation-booking reservation-edge
  database_swapped=false
  printf '%s\n' "restore: smoke failed; previous database and protected state were restarted" >&2
  exit 1
fi
dropdb "${database_url%/reservation}/$previous_database"
database_swapped=false
completed=true
printf '%s\n' "Restore verified for installation $confirmation."

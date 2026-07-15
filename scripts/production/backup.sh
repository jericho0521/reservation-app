#!/bin/sh

set -eu

fail() { printf '%s\n' "backup: $1" >&2; exit 64; }

backup_directory=${RESERVATION_BACKUP_DIRECTORY:-/backups}
config_directory=${RESERVATION_PRODUCTION_CONFIG_DIR:-/run/reservation-config}
whatsapp_directory=${RESERVATION_WHATSAPP_SESSION_DIRECTORY:-/run/reservation-whatsapp-sessions}
database_url=${RESERVATION_DATABASE_URL:-postgresql://postgres@reservation-db:5432/reservation}
maximum_migration=${RESERVATION_MAXIMUM_MIGRATION:-$(node /opt/reservation-tools/scripts/production/backup-manifest.mjs latest --index /opt/reservation-tools/packages/database/migrations/supabase/migration-index.json)}

for file in installation-id release.env database-password installation-master-key internal-service-key whatsapp-session-key backup-recovery-key; do
  [ ! -L "$config_directory/$file" ] && [ -f "$config_directory/$file" ] || fail "protected file is unavailable: $file"
done
[ ! -L "$whatsapp_directory" ] && [ -d "$whatsapp_directory" ] || fail "WhatsApp state directory is unavailable"
mkdir -p "$backup_directory"
[ ! -L "$backup_directory" ] && [ -d "$backup_directory" ] || fail "backup directory must be a regular directory"

release=$(sed -n 's/^RESERVATION_RELEASE=//p' "$config_directory/release.env")
installation_id=$(cat "$config_directory/installation-id")
PGPASSWORD=$(cat "$config_directory/database-password")
export PGPASSWORD
migration=$(psql "$database_url" --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align --command \
  "begin; select pg_advisory_xact_lock(hashtextextended('reservation-platform-backup-metadata', 0)); select coalesce(max(substring(filename from '/([0-9]{6})_')), '000000') from public.reservation_local_migration_ledger; commit;" \
  | sed -n '/^[0-9][0-9]*$/p' | tail -n 1)
[ -n "$release" ] && [ -n "$migration" ] || fail "release or migration metadata is unavailable"
[ "$migration" -le "$maximum_migration" ] 2>/dev/null || fail "database migration is newer than this backup tool"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
archive_name="reservation-${installation_id}-${release}-${timestamp}.tar.age"
record_id=$(psql "$database_url" --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align \
  --set release="$release" --set migration="$migration" --set archive="$archive_name" \
  --command "select (public.record_platform_backup(:'release', :'migration', :'archive')).id;")
temporary=$(mktemp -d "${TMPDIR:-/tmp}/reservation-backup.XXXXXX")
chmod 0700 "$temporary"
completed=false
cleanup() {
  status=$?
  rm -rf "$temporary"
  unset PGPASSWORD AGE_PASSPHRASE
  if [ "$completed" != "true" ] && [ -n "${record_id:-}" ]; then
    psql "$database_url" --no-psqlrc --set ON_ERROR_STOP=1 --set id="$record_id" \
      --command "select public.transition_platform_backup(:'id'::uuid, 'failed', null, 'backup_command_failed');" >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap cleanup 0 HUP INT TERM

mkdir -m 0700 "$temporary/secrets" "$temporary/whatsapp"
pg_dump "$database_url" --format=custom \
  --exclude-table-data=public.platform_whatsapp_pairing_state \
  --file "$temporary/database.dump"
install -m 0600 "$config_directory/installation-master-key" "$temporary/secrets/installation-master-key"
install -m 0600 "$config_directory/installation-id" "$temporary/secrets/installation-id"
install -m 0600 "$config_directory/internal-service-key" "$temporary/secrets/internal-service-key"
install -m 0600 "$config_directory/whatsapp-session-key" "$temporary/secrets/whatsapp-session-key"
cp -a "$whatsapp_directory/." "$temporary/whatsapp/"
find "$temporary/whatsapp" -type f \( -iname '*temporary*qr*' -o -iname '*qr*payload*' \) -delete
node /opt/reservation-tools/scripts/production/backup-manifest.mjs build \
  --root "$temporary" --release "$release" --migration "$migration" --installation "$installation_id" \
  > "$temporary/manifest.json"

tar -cf "$temporary/backup.tar" -C "$temporary" manifest.json database.dump secrets whatsapp
AGE_PASSPHRASE=$(cat "$config_directory/backup-recovery-key")
export AGE_PASSPHRASE
age --encrypt --passphrase --output "$temporary/$archive_name" "$temporary/backup.tar"
unset AGE_PASSPHRASE
sha256sum "$temporary/$archive_name" | sed "s|$temporary/||" > "$temporary/$archive_name.sha256"

RESERVATION_BACKUP_DIRECTORY="$temporary" /opt/reservation-tools/scripts/production/verify-backup.sh \
  --archive "$temporary/$archive_name" \
  --recovery-key "$config_directory/backup-recovery-key" \
  --maximum-migration "$maximum_migration"
install -m 0600 "$temporary/$archive_name" "$backup_directory/.$archive_name.tmp"
install -m 0600 "$temporary/$archive_name.sha256" "$backup_directory/.$archive_name.sha256.tmp"
mv "$backup_directory/.$archive_name.tmp" "$backup_directory/$archive_name"
mv "$backup_directory/.$archive_name.sha256.tmp" "$backup_directory/$archive_name.sha256"
archive_sha256=$(awk '{ print $1 }' "$backup_directory/$archive_name.sha256")
psql "$database_url" --no-psqlrc --set ON_ERROR_STOP=1 --set id="$record_id" --set checksum="$archive_sha256" \
  --command "select public.transition_platform_backup(:'id'::uuid, 'verified', :'checksum', null);" >/dev/null
completed=true
printf '%s\n' "Verified encrypted backup: $backup_directory/$archive_name"

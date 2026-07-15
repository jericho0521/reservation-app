#!/bin/sh

set -eu

fail() {
  printf '%s\n' "configure-production: $1" >&2
  exit 64
}

[ "$#" -eq 4 ] || fail "usage: configure-production --domain <dns-name> --release <semver>"
[ "$1" = "--domain" ] && [ "$3" = "--release" ] || fail "usage: configure-production --domain <dns-name> --release <semver>"

domain=$2
release=$4
protected=${RESERVATION_PRODUCTION_CONFIG_DIR:-/run/reservation-config}

[ ! -L "$protected" ] && [ -d "$protected" ] || fail "protected configuration path must be a regular directory"
if [ -z "$(/bin/ls -A "$protected")" ]; then
  chmod 0700 "$protected"
fi

node /opt/reservation-tools/configure.mjs --domain "$domain" --release "$release"

publish() {
  source_file=$1
  target_directory=$2
  target_name=$3
  owner=$4
  group=$5
  [ ! -L "$source_file" ] && [ -f "$source_file" ] || fail "protected source is unavailable"
  mkdir -p "$target_directory"
  chmod 0700 "$target_directory"
  chown "$owner:$group" "$target_directory"
  temporary="$target_directory/.${target_name}.$$"
  cp "$source_file" "$temporary"
  chmod 0400 "$temporary"
  chown "$owner:$group" "$temporary"
  mv -f "$temporary" "$target_directory/$target_name"
}

publish "$protected/database-password" /run/reservation-db-secrets database-password 0 0
publish "$protected/database-password" /run/reservation-migrate-secrets database-password 0 0
publish "$protected/postgrest-jwt-secret" /run/reservation-rest-secrets postgrest-jwt-secret 1000 1000

database_password=$(/bin/cat "$protected/database-password")
temporary_uri=/run/reservation-rest-secrets/.database-uri.$$
umask 077
printf 'postgresql://postgres:%s@reservation-db:5432/reservation\n' "$database_password" > "$temporary_uri"
chmod 0400 "$temporary_uri"
chown 1000:1000 "$temporary_uri"
mv -f "$temporary_uri" /run/reservation-rest-secrets/database-uri
unset database_password

for name in postgrest-anon-token postgrest-service-token internal-service-key whatsapp-session-key; do
  publish "$protected/$name" /run/reservation-api-secrets "$name" 0 0
done
publish "$protected/internal-service-key" /run/reservation-console-secrets internal-service-key 0 0
for name in internal-service-key installation-master-key whatsapp-session-key; do
  publish "$protected/$name" /run/reservation-worker-secrets "$name" 0 0
done

session_directory=/run/reservation-whatsapp-sessions
[ ! -L "$session_directory" ] || fail "WhatsApp session path must not be a symbolic link"
if [ -e "$session_directory" ]; then
  [ -d "$session_directory" ] || fail "WhatsApp session path must be a directory"
else
  mkdir -p "$session_directory"
fi
[ ! -L "$session_directory" ] && [ -d "$session_directory" ] || fail "WhatsApp session path must be a regular directory"
chown 1001:1001 "$session_directory"
chmod 0700 "$session_directory"

printf '%s\n' '{"status":"service-secrets-ready"}'

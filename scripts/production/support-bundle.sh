#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT=""
FIXTURE_DIR=""
INSTALL_DIR="${RESERVATION_INSTALL_DIR:-/opt/reservation-platform}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      [[ -n "${2:-}" ]] || { echo "--output requires a path" >&2; exit 2; }
      OUTPUT="$2"
      shift 2
      ;;
    --fixture-dir)
      [[ -n "${2:-}" ]] || { echo "--fixture-dir requires a path" >&2; exit 2; }
      FIXTURE_DIR="$2"
      shift 2
      ;;
    --install-dir)
      [[ -n "${2:-}" ]] || { echo "--install-dir requires a path" >&2; exit 2; }
      INSTALL_DIR="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$OUTPUT" ]]; then
  OUTPUT="$PWD/reservation-support-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
fi
if [[ -e "$OUTPUT" || -L "$OUTPUT" ]]; then
  echo "Support bundle output already exists; choose a new path." >&2
  exit 2
fi
if [[ -n "$FIXTURE_DIR" && ! -d "$FIXTURE_DIR" ]]; then
  echo "Fixture directory does not exist." >&2
  exit 2
fi
if [[ -z "$FIXTURE_DIR" && ! -f "$INSTALL_DIR/compose.production.yml" ]]; then
  echo "Production installation not found; pass --install-dir." >&2
  exit 2
fi

mkdir -p "$(dirname "$OUTPUT")"
STAGING="$(mktemp -d "${TMPDIR:-/tmp}/reservation-support.XXXXXX")"
cleanup() { rm -rf "$STAGING"; }
trap cleanup EXIT
chmod 700 "$STAGING"

SANITIZER="$ROOT_DIR/scripts/production/support-bundle-sanitize.mjs"

if [[ -n "$FIXTURE_DIR" ]]; then
  node "$SANITIZER" versions < "$FIXTURE_DIR/versions.json" > "$STAGING/versions.json"
  node "$SANITIZER" compose < "$FIXTURE_DIR/compose.json" > "$STAGING/compose-status.json"
  node "$SANITIZER" health < "$FIXTURE_DIR/health.json" > "$STAGING/health.json"
  node "$SANITIZER" queue < "$FIXTURE_DIR/queue.json" > "$STAGING/queue-counts.json"
  node "$SANITIZER" disk < "$FIXTURE_DIR/disk.json" > "$STAGING/disk-summary.json"
  node "$SANITIZER" config < "$FIXTURE_DIR/config-presence.json" > "$STAGING/config-presence.json"
  node "$SANITIZER" logs < "$FIXTURE_DIR/logs.jsonl" > "$STAGING/recent-errors.ndjson"
else
  compose_file="$INSTALL_DIR/compose.production.yml"
  compose_args=(-f "$compose_file")
  if [[ -f "$INSTALL_DIR/release.env" ]]; then
    compose_args=(--env-file "$INSTALL_DIR/release.env" -f "$compose_file")
  fi

  release="${RESERVATION_RELEASE_VERSION:-unknown}"
  if [[ "$release" == "unknown" && -f "$INSTALL_DIR/release.env" ]]; then
    release="$(sed -n 's/^RESERVATION_RELEASE=//p' "$INSTALL_DIR/release.env" | head -n 1)"
    release="${release:-unknown}"
  fi
  migration="${RESERVATION_MIGRATION_VERSION:-unknown}"
  if [[ "$migration" == "unknown" ]]; then
    migration="$(docker compose "${compose_args[@]}" exec -T reservation-db \
      psql -X -qAt -U postgres -d reservation -v ON_ERROR_STOP=1 \
      -c "select coalesce(substring(filename from '([0-9]{6})_'), 'unknown') from public.reservation_local_migration_ledger order by filename desc limit 1;" \
      2>/dev/null || printf 'unknown')"
  fi
  node -e 'const [release, migration] = process.argv.slice(1); process.stdout.write(JSON.stringify({ release_version: release, migration_version: migration }));' \
    "$release" "$migration" | node "$SANITIZER" versions > "$STAGING/versions.json"

  if ! docker compose "${compose_args[@]}" ps --all --format json 2>/dev/null \
    | node "$SANITIZER" compose > "$STAGING/compose-status.json"; then
    printf '[]\n' > "$STAGING/compose-status.json"
  fi

  if ! docker compose "${compose_args[@]}" exec -T reservation-api node -e \
    "fetch('http://127.0.0.1:4100/v1/health/ready').then(async response => { process.stdout.write(await response.text()); }).catch(() => { process.exitCode = 1; });" \
    2>/dev/null | node "$SANITIZER" health > "$STAGING/health.json"; then
    printf '{"status":"unavailable"}\n' | node "$SANITIZER" health > "$STAGING/health.json"
  fi

  queue_sql="select json_build_object('pending', count(*) filter (where status in ('pending','leased')), 'failed', count(*) filter (where status = 'failed'), 'oldest_age_seconds', coalesce(extract(epoch from (now() - min(created_at) filter (where status in ('pending','leased'))))::integer, 0))::text from public.platform_jobs;"
  if ! docker compose "${compose_args[@]}" exec -T reservation-db \
    psql -X -qAt -U postgres -d reservation -v ON_ERROR_STOP=1 -c "$queue_sql" 2>/dev/null \
    | node "$SANITIZER" queue > "$STAGING/queue-counts.json"; then
    printf '{}\n' | node "$SANITIZER" queue > "$STAGING/queue-counts.json"
  fi

  config_sql="select json_build_object('ai_configured', exists(select 1 from public.platform_integration_settings where kind = 'ai' and enabled), 'email_configured', exists(select 1 from public.platform_integration_settings where kind = 'email' and enabled), 'whatsapp_configured', exists(select 1 from public.platform_whatsapp_sessions where status = 'connected'))::text;"
  if ! docker compose "${compose_args[@]}" exec -T reservation-db \
    psql -X -qAt -U postgres -d reservation -v ON_ERROR_STOP=1 -c "$config_sql" 2>/dev/null \
    | node "$SANITIZER" config > "$STAGING/config-presence.json"; then
    printf '{}\n' > "$STAGING/config-presence.json"
  fi

  disk_target="$INSTALL_DIR"
  if ! df -Pk "$disk_target" | awk 'NR == 2 { gsub(/%/, "", $5); printf "{\"capacity_kb\":%s,\"used_kb\":%s,\"available_kb\":%s,\"used_percent\":%s}\n", $2, $3, $4, $5 }' \
    | node "$SANITIZER" disk > "$STAGING/disk-summary.json"; then
    printf '{}\n' | node "$SANITIZER" disk > "$STAGING/disk-summary.json"
  fi

  if ! docker compose "${compose_args[@]}" logs --no-color --since 24h --tail 500 reservation-api reservation-worker 2>/dev/null \
    | node "$SANITIZER" logs > "$STAGING/recent-errors.ndjson"; then
    : > "$STAGING/recent-errors.ndjson"
  fi
fi

printf '%s\n' "This archive contains allowlisted operational metadata only. It excludes environment values, request and message bodies, QR payloads, cookies, tokens, credentials, and customer details." > "$STAGING/README.txt"

tar -C "$STAGING" -czf "$OUTPUT" \
  README.txt \
  versions.json \
  compose-status.json \
  health.json \
  queue-counts.json \
  disk-summary.json \
  config-presence.json \
  recent-errors.ndjson
chmod 600 "$OUTPUT"
printf '%s\n' "$OUTPUT"

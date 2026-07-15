#!/bin/sh

set -eu

INSTALL_DIR=/opt/reservation-platform
REGISTRY=ghcr.io/jericho0521
SOURCE_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)

fail() {
  printf '%s\n' "installer: $1" >&2
  exit 64
}

domain=
release=
host_ip=
resume=false
while [ "$#" -gt 0 ]; do
  case $1 in
    --domain)
      [ "$#" -ge 2 ] || fail "--domain requires a value"
      domain=$2
      shift 2
      ;;
    --release)
      [ "$#" -ge 2 ] || fail "--release requires a value"
      release=$2
      shift 2
      ;;
    --host-ip)
      [ "$#" -ge 2 ] || fail "--host-ip requires a value"
      host_ip=$2
      shift 2
      ;;
    --resume)
      resume=true
      shift
      ;;
    *) fail "usage: install.sh [--domain <dns-name>] [--release <semver>] [--host-ip <public-ip>] [--resume]" ;;
  esac
done

if [ -z "$domain" ]; then
  [ -t 0 ] || fail "--domain is required in non-interactive mode"
  printf '%s' "Public booking domain: " >&2
  IFS= read -r domain
fi
if [ -z "$release" ]; then
  [ -t 0 ] || fail "--release is required in non-interactive mode"
  printf '%s' "Exact release (for example 0.2.0): " >&2
  IFS= read -r release
fi

[ "$(id -u)" -eq 0 ] || fail "run the supported installer as root"
printf '%s\n' "$release" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$' \
  || fail "release must be an exact immutable release tag"
case $release in
  *-*)
    prerelease=${release#*-}
    previous_ifs=$IFS
    IFS=.
    # shellcheck disable=SC2086
    set -- $prerelease
    IFS=$previous_ifs
    for identifier in "$@"; do
      case $identifier in
        0|[1-9]*|*[!0-9]*) ;;
        0*) fail "release must be an exact immutable release tag" ;;
      esac
    done
    ;;
esac

release_environment=$(printf '%s\n' \
  "RESERVATION_DOMAIN=$domain" \
  "RESERVATION_RELEASE=$release" \
  "RESERVATION_API_IMAGE=$REGISTRY/reservation-app-api:$release" \
  "RESERVATION_WORKER_IMAGE=$REGISTRY/reservation-app-worker:$release" \
  "RESERVATION_CONSOLE_IMAGE=$REGISTRY/reservation-app-console:$release" \
  "RESERVATION_BOOKING_IMAGE=$REGISTRY/reservation-app-booking:$release" \
  "RESERVATION_TOOLS_IMAGE=$REGISTRY/reservation-app-tools:$release")
release_file=$INSTALL_DIR/release.env
tools_image=$REGISTRY/reservation-app-tools:$release
resume_edge_id=
rollback_edge_required=false

rollback_edge() {
  rollback_status=$?
  trap - 0 HUP INT TERM
  if [ "$rollback_edge_required" = "true" ] && [ -n "$resume_edge_id" ]; then
    if ! docker start "$resume_edge_id" >/dev/null 2>&1; then
      printf '%s\n' "installer: failed to restart the previous reservation edge container $resume_edge_id" >&2
    fi
  fi
  exit "$rollback_status"
}

production_compose() {
  docker compose \
    --project-directory "$INSTALL_DIR" \
    --env-file "$release_file" \
    -f "$INSTALL_DIR/compose.production.yml" \
    "$@"
}

if [ "$resume" = "false" ]; then
  [ ! -e "$INSTALL_DIR" ] && [ ! -L "$INSTALL_DIR" ] \
    || fail "installation path already exists; use --resume only for the same release and domain"
else
  [ ! -L "$INSTALL_DIR" ] && [ -d "$INSTALL_DIR" ] || fail "resume requires the existing regular installation directory"
  [ ! -L "$release_file" ] && [ -f "$release_file" ] || fail "resume requires the existing regular release.env"
  [ ! -L "$INSTALL_DIR/compose.production.yml" ] && [ -f "$INSTALL_DIR/compose.production.yml" ] \
    || fail "resume requires the existing regular production Compose file"
  existing_release_environment=$(cat "$release_file")
  [ "$existing_release_environment" = "$release_environment" ] \
    || fail "existing release.env does not match the requested domain and release"
  unset existing_release_environment

  existing_edge=$(production_compose ps -q reservation-edge 2>/dev/null) \
    || fail "resume could not inspect the existing reservation edge"
  if [ -n "$existing_edge" ]; then
    case $existing_edge in
      *[!a-f0-9]*) fail "resume found an invalid reservation edge container ID" ;;
    esac
    resume_edge_id=$existing_edge
    edge_service=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$resume_edge_id" 2>/dev/null) \
      || fail "resume could not verify the existing reservation edge"
    [ "$edge_service" = "reservation-edge" ] || fail "resume refused an unrelated public-port container"
    edge_working_directory=$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$resume_edge_id" 2>/dev/null) \
      || fail "resume could not verify the existing reservation edge"
    [ "$edge_working_directory" = "$INSTALL_DIR" ] || fail "resume refused an edge from another installation"
    edge_running=$(docker inspect --format '{{ .State.Running }}' "$resume_edge_id" 2>/dev/null) \
      || fail "resume could not inspect the existing reservation edge"
    if [ "$edge_running" = "true" ]; then
      rollback_edge_required=true
      trap rollback_edge 0
      trap 'exit 129' HUP
      trap 'exit 130' INT
      trap 'exit 143' TERM
      production_compose stop reservation-edge
    fi
  fi
fi

# INSTALL_STEP: preflight
if [ -n "$host_ip" ]; then
  "$SOURCE_ROOT/scripts/production/preflight.sh" --domain "$domain" --host-ip "$host_ip"
else
  "$SOURCE_ROOT/scripts/production/preflight.sh" --domain "$domain"
fi

docker pull "$tools_image"
docker run \
  --rm \
  --network none \
  --read-only \
  --log-driver none \
  --mount "type=bind,src=$SOURCE_ROOT,dst=/bundle,readonly" \
  "$tools_image" \
  node /opt/reservation-tools/release-manifest.mjs --check \
  --root /bundle \
  --manifest /bundle/release-manifest.json \
  --release "$release"

# INSTALL_STEP: create-target
[ ! -L "$INSTALL_DIR" ] || fail "installation path must not be a symbolic link"
[ ! -L "$INSTALL_DIR/docker" ] || fail "installation asset path must not be a symbolic link"
[ ! -L "$INSTALL_DIR/docker/production" ] || fail "installation asset path must not be a symbolic link"
[ ! -L "$INSTALL_DIR/docker/production/allowlists" ] || fail "installation asset path must not be a symbolic link"
[ ! -L "$INSTALL_DIR/scripts" ] || fail "installation asset path must not be a symbolic link"
[ ! -L "$INSTALL_DIR/scripts/production" ] || fail "installation asset path must not be a symbolic link"
install -d -m 0750 -o root -g root "$INSTALL_DIR"
install -d -m 0750 -o root -g root "$INSTALL_DIR/docker/production/allowlists"
install -d -m 0750 -o root -g root "$INSTALL_DIR/scripts/production"

# INSTALL_STEP: copy-assets
for required in \
  compose.production.yml \
  docker/production/Caddyfile \
  docker/production/postgrest.conf \
  docker/production/allowlists/api.env \
  docker/production/allowlists/console.env \
  docker/production/allowlists/migrate.env \
  docker/production/allowlists/worker.env \
  release-manifest.json \
  scripts/production/smoke.mjs
do
  [ -f "$SOURCE_ROOT/$required" ] || fail "release asset is missing: $required"
  [ ! -L "$INSTALL_DIR/$required" ] || fail "installation asset must not be a symbolic link: $required"
  install -m 0644 -o root -g root "$SOURCE_ROOT/$required" "$INSTALL_DIR/$required"
done

release_temporary=$INSTALL_DIR/.release.env.$$
[ ! -L "$release_file" ] || fail "release.env must not be a symbolic link"
umask 027
printf '%s\n' "$release_environment" > "$release_temporary"
chmod 0640 "$release_temporary"
chown root:root "$release_temporary"
if [ -e "$release_file" ] && ! cmp -s "$release_temporary" "$release_file"; then
  rm -f "$release_temporary"
  fail "existing release.env does not match the requested domain and release"
fi
if [ -e "$release_file" ]; then
  rm -f "$release_temporary"
else
  mv "$release_temporary" "$release_file"
fi
unset release_environment

# INSTALL_STEP: configure
production_compose up --no-deps --abort-on-container-exit --exit-code-from reservation-config reservation-config

# INSTALL_STEP: pull-images
production_compose pull

# INSTALL_STEP: start-database
production_compose up -d --no-deps reservation-db
database_attempt=0
until production_compose exec -T reservation-db pg_isready -h 127.0.0.1 -U postgres -d reservation >/dev/null 2>&1; do
  database_attempt=$((database_attempt + 1))
  [ "$database_attempt" -lt 60 ] || fail "database readiness timed out; run docker compose logs reservation-db"
  sleep 2
done

# INSTALL_STEP: migrate
production_compose up --no-deps --abort-on-container-exit --exit-code-from reservation-migrate reservation-migrate

# INSTALL_STEP: start-private-services
production_compose up -d \
  reservation-rest \
  reservation-api \
  reservation-worker \
  reservation-console \
  reservation-booking

worker_id=$(production_compose ps -q reservation-worker 2>/dev/null) \
  || fail "worker readiness could not inspect the reservation worker"
[ -n "$worker_id" ] || fail "worker readiness could not find the reservation worker"
worker_attempt=0
while :; do
  worker_health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$worker_id" 2>/dev/null) \
    || fail "worker readiness could not inspect the reservation worker"
  case $worker_health in
    healthy) break ;;
    unhealthy) fail "reservation worker became unhealthy; run docker compose logs reservation-worker" ;;
    starting) ;;
    *) fail "reservation worker has no health check" ;;
  esac
  worker_attempt=$((worker_attempt + 1))
  [ "$worker_attempt" -lt 60 ] \
    || fail "worker readiness timed out; run docker compose logs reservation-worker"
  sleep 2
done

# INSTALL_STEP: start-edge
if [ "$rollback_edge_required" = "true" ]; then
  docker start "$resume_edge_id" >/dev/null
  rollback_edge_required=false
  trap - 0 HUP INT TERM
else
  production_compose up -d reservation-edge
fi

setup_token=$(production_compose run --rm --no-deps --entrypoint /bin/cat reservation-config /run/reservation-config/setup-token)
case $setup_token in
  *[!A-Za-z0-9_-]*|'') fail "protected setup capability is unavailable" ;;
esac
[ "${#setup_token}" -eq 43 ] || fail "protected setup capability is unavailable"

# INSTALL_STEP: wait-readiness
printf '%s' "$setup_token" | docker run \
  --rm \
  --network host \
  --add-host "$domain:127.0.0.1" \
  --read-only \
  -i \
  --mount "type=bind,src=$INSTALL_DIR/scripts/production/smoke.mjs,dst=/opt/reservation-smoke.mjs,readonly" \
  "$tools_image" \
  node /opt/reservation-smoke.mjs \
  --origin "https://$domain" \
  --setup-token-stdin

# INSTALL_STEP: print-setup-url
printf '\n%s\n%s\n' \
  "Installation is ready. Open this one-time URL in a private browser window:" \
  "https://$domain/admin/setup?token=$setup_token"
unset setup_token

# Install the reservation platform on Ubuntu

This how-to guide installs one appointment business on one clean Ubuntu VPS. It is for an operator who can connect to the server with SSH and manage DNS but does not need to understand the monorepo or edit application environment variables.

The supported path uses prebuilt release images. It does not compile source, load demo data, or ask you to maintain a production `.env` file.

## Before you begin

Prepare all of the following:

- A clean x86-64 Ubuntu 22.04 or 24.04 VPS with at least 2 CPU cores, 2 GiB memory, and 10 GiB free disk space.
- Docker Engine running for the root user and Docker Compose v2 available as `docker compose`.
- A public DNS name whose A record resolves directly to the VPS public IP.
- Inbound TCP ports 80 and 443, and inbound UDP port 443, allowed by the VPS and provider firewalls.
- An extracted reservation-platform release bundle for the exact version recorded in its `release-manifest.json` (the current source candidate is `0.2.0`).
- Access to the release images in `ghcr.io/jericho0521` when the registry requires authentication.

The installer supports x86-64 only. It rejects a Docker Compose v1 binary, occupied public ports, private or mismatched DNS, and hosts below the minimum memory or disk limits before writing `/opt/reservation-platform`.

Verify Docker before starting:

```bash
sudo docker info
sudo docker compose version
```

If either command fails, install or repair Docker Engine and the Compose v2 plugin first. The reservation installer does not modify the host package manager or install Docker implicitly.

## Prepare DNS

Create an A record for the booking domain, for example `book.example.com`, pointing to the VPS public IPv4 address. Wait until the record is visible from the VPS:

```bash
getent ahostsv4 book.example.com
hostname -I
```

The domain must be lowercase ASCII, contain at least one dot, and have no scheme, path, wildcard, port, or trailing dot. If the VPS exposes a public address that is not returned by `hostname -I`, pass it to the installer with `--host-ip`.

## Run the installer

Change to the root of the extracted release bundle, then run:

```bash
sudo ./scripts/production/install.sh \
  --domain book.example.com \
  --release 0.2.0 \
  --host-ip 203.0.113.10
```

Omit `--host-ip` only when the first address returned by `hostname -I` is the address in public DNS. You may omit `--domain` or `--release` in an interactive terminal; the installer prompts for the missing non-secret value.

The installer performs these operations in order:

1. Validates Ubuntu, x86-64, CPU, memory, disk, Docker, Compose v2, public ports, domain, and DNS.
2. Pulls the exact-version tools image and verifies `release-manifest.json`, all installer-consumed asset SHA-256 values, and the five exact API/worker/console/booking/tools image references.
3. Copies only the verified production release assets into `/opt/reservation-platform`, writes the non-secret release selection to `release.env`, and generates protected infrastructure secrets in Docker volumes.
4. Pulls the remaining release images without building source.
5. Starts PostgreSQL, waits for it, and applies the indexed core migrations.
6. Starts PostgREST, the API, worker, console, and public booking application.
7. Starts Caddy and waits for HTTPS liveness, readiness, setup-page, unpublished-home, and demo-absence checks.
8. Prints one setup URL.

Do not edit `/opt/reservation-platform/release.env`. Generated infrastructure secrets are retained rather than rotated when the configuration step is repeated.

If installation stops after this installation's Caddy container has claimed ports 80 or 443, inspect the failed layer and use the explicit resume path with exactly the original values:

```bash
sudo ./scripts/production/install.sh \
  --resume \
  --domain book.example.com \
  --release 0.2.0 \
  --host-ip 203.0.113.10
```

Resume refuses a different `release.env`, a symlinked installation path, or an edge container owned by another Compose working directory. It records the exact running edge container ID and installs an exit rollback before stopping it. Any failure before the start-edge cutover restarts that same container. At cutover, the installer successfully restarts the recorded container before clearing the rollback trap. The unchanged port preflight therefore still rejects unrelated listeners without turning a failed resume into an avoidable outage. Resume does not delete containers, volumes, or generated secrets.

## Understand the Phase 1 release manifest

`release-manifest.json` is deterministic release metadata. It records the package release, the five exact versioned application image references, and SHA-256 checksums for every host asset the installer or production stack consumes. The tools image verifies the bundle through a read-only, network-disabled mount before the installer creates or changes `/opt/reservation-platform`.

Repository maintainers regenerate and check the current candidate with:

```bash
node scripts/production/release-manifest.mjs --generate
node scripts/production/release-manifest.mjs --check
```

This Phase 1 manifest detects release and bundle drift; it is not yet a publication signature or registry authenticity proof. Phase 6 publishes digest-qualified artifacts and signs the release. Do not describe the current local candidate as published or signed.

## Open the one-time setup page

When every check passes, the installer prints one URL in this form:

```text
https://book.example.com/admin/setup?token=<redacted>
```

Open it in a private browser window. Do not paste the URL into chat, tickets, screenshots, shell history, or shared logs. Phase 1 displays an infrastructure-ready landing page. The owner-creation operation is added at this stable route in Phase 2.

The installer passes the setup capability to its smoke probe through standard input. It does not put the token in a command argument, environment variable, ordinary host file, or diagnostic output.

## Verify the installation

The installer already runs the strict public smoke checks. You can inspect container state without exposing secrets:

```bash
cd /opt/reservation-platform
sudo docker compose --env-file release.env -f compose.production.yml ps --all
```

Expected permanent services are `reservation-db`, `reservation-rest`, `reservation-api`, `reservation-worker`, `reservation-console`, `reservation-booking`, and `reservation-edge`. The `reservation-config` and `reservation-migrate` services are successful one-shot containers.

Only Caddy publishes host ports. Confirm that PostgreSQL and PostgREST have no host bindings:

```bash
sudo docker compose --env-file release.env -f compose.production.yml port reservation-db 5432
sudo docker compose --env-file release.env -f compose.production.yml port reservation-rest 3000
```

Both commands should report that no public port is assigned.

## Diagnose a failed layer

The installer stops at the first failed layer and prints a safe error. Inspect only the affected service:

```bash
cd /opt/reservation-platform
sudo docker compose --env-file release.env -f compose.production.yml ps --all
sudo docker compose --env-file release.env -f compose.production.yml logs --tail 100 reservation-db
sudo docker compose --env-file release.env -f compose.production.yml logs --tail 100 reservation-migrate
sudo docker compose --env-file release.env -f compose.production.yml logs --tail 100 reservation-api
sudo docker compose --env-file release.env -f compose.production.yml logs --tail 100 reservation-edge
```

Do not print, copy, inspect, or attach Docker volume contents. Do not delete volumes to hide a migration drift or secret-distribution error.

Common failures are:

- **DNS mismatch:** Update the A record or pass the correct public address with `--host-ip`, then wait for DNS propagation.
- **Port 80 or 443 occupied:** Stop the conflicting reverse proxy before the first installation. Do not publish another platform service directly.
- **Registry pull denied:** Authenticate the root Docker client to the release registry, then rerun the same installer command.
- **TLS readiness timeout:** Confirm both public TCP ports reach this VPS and the DNS name resolves publicly. Caddy must be able to complete certificate issuance.
- **Migration failure:** Read the bounded migration log and correct the reported checksum, connectivity, or SQL error. Never skip the indexed migration service.

## Scope of this phase

This Phase 1 path proves the production infrastructure and stable setup route. It does not yet create the owner, publish a business, configure AI or WhatsApp, perform backup and restore, or implement upgrades. Those capabilities are delivered by the later gated phases without changing the supported installation directory or public route structure.

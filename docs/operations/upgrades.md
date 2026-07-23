# Versioned Upgrades and Recovery

Production upgrades accept a release manifest, never a floating tag. The target manifest has this shape:

```json
{
  "version": "0.2.0",
  "images": {
    "api": { "image": "ghcr.io/example/api:0.2.0", "digest": "sha256:<64-hex>" },
    "worker": { "image": "ghcr.io/example/worker:0.2.0", "digest": "sha256:<64-hex>" },
    "console": { "image": "ghcr.io/example/console:0.2.0", "digest": "sha256:<64-hex>" },
    "booking": { "image": "ghcr.io/example/booking:0.2.0", "digest": "sha256:<64-hex>" },
    "tools": { "image": "ghcr.io/example/tools:0.2.0", "digest": "sha256:<64-hex>" }
  },
  "requiredMigration": "000043",
  "minimumFromVersion": "0.1.0",
  "rollbackCompatible": true
}
```

Use release-pipeline-provided image names and digests. `latest`, missing digests, unsupported source versions, unverified backups, and insufficient disk are rejected. A downgrade additionally requires manifest field `"downgradeCompatible": true` and the operator flag `--allow-compatible-downgrade`. A release with irreversible migrations must set `rollbackCompatible` to `false` and the operator must pass `--restore-declared` after confirming recovery requirements.

## Upgrade

Place the target manifest in `/opt/reservation-platform`, confirm the separate recovery key is available, then run:

```bash
docker compose --env-file release.env -f compose.production.yml --profile operations run --rm \
  --entrypoint /opt/reservation-tools/scripts/production/upgrade.sh \
  reservation-operations --manifest /opt/reservation-installation/target-release.json
```

The fixed order is: validate the target and resources, create and independently verify a fresh encrypted backup, link that backup to the upgrade record, pull digest-pinned images, stop public traffic/application writes, run migrations, start target private services, wait for all service readiness, expose the edge, run production smoke, atomically replace host/protected `release.env`, and record `healthy`.

If readiness or smoke fails and `rollbackCompatible` is true, target services stop and the previous pinned images restart. If it is false, the tool records `failed`, leaves public traffic stopped, and prints a `recover-upgrade.sh` direction. It never automatically restores a backup over the only live database.

## Failed irreversible upgrade recovery

After confirming the archive and installation UUID, run the explicit recovery wrapper:

```bash
docker compose --env-file release.env -f compose.production.yml --profile operations run --rm \
  --entrypoint /opt/reservation-tools/scripts/production/recover-upgrade.sh \
  reservation-operations \
  --archive /backups/<verified-pre-upgrade-archive>.tar.age \
  --confirm-restore <installation-uuid>
```

Complete both the passing and intentionally failed-readiness scenarios in [the upgrade drill record](../release-evidence/phase-5-upgrade-drill.md) before release.

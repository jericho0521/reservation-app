# Encrypted Backup and Verified Restore

Production backups are one-business installation backups. Each archive contains the PostgreSQL custom dump, protected installation identity, installation/WhatsApp encryption keys, the internal service key required by restored services, and the persistent WhatsApp session directory. It deliberately excludes the independent backup recovery key, logs, temporary QR payloads, and Caddy certificate state.

The PostgreSQL dump includes knowledge sources, locally generated embeddings, and `pgvector` columns introduced by migration `000040`. Restore with the supported release database image so the `vector` extension is available before the dump is loaded. The embedding model itself is immutable image content and is not copied into each backup.

## Recovery-key responsibility

Before relying on backups, copy `/run/reservation-config/backup-recovery-key` from the protected configuration volume to an offline password manager or encrypted removable medium. Keep it separate from both the server and every `.tar.age` archive. Loss of this key makes encrypted archives unrecoverable; storing it beside an archive defeats the separation this design provides.

The operational Compose service is disabled by default under the `operations` profile. It mounts the Docker socket and protected volumes only for an explicitly invoked operation. Do not leave an operations container running.

## Create and verify a backup

Set the installation and off-host-capable backup directories, then run the one-shot service:

```bash
cd /opt/reservation-platform
export RESERVATION_INSTALLATION_DIRECTORY=/opt/reservation-platform
export RESERVATION_BACKUP_DIRECTORY=/var/backups/reservation-platform
docker compose --env-file release.env -f compose.production.yml --profile operations run --rm reservation-operations
```

The command takes a custom-format `pg_dump`, builds `manifest.json`, encrypts the tar with `age --passphrase`, writes a SHA-256 sidecar, decrypts it into a second mode-0700 temporary directory, verifies the manifest and database checksum, and only then records the backup as `verified`. Plaintext staging is removed by a trap on success or failure.

Copy both the `.tar.age` file and its `.sha256` sidecar off the server. A backup remaining only on the installation host is not a disaster-recovery backup.

To re-verify an existing archive without restoring it:

```bash
docker compose --env-file release.env -f compose.production.yml --profile operations run --rm \
  --entrypoint /opt/reservation-tools/scripts/production/verify-backup.sh \
  reservation-operations \
  --archive /backups/<archive>.tar.age \
  --recovery-key /run/reservation-config/backup-recovery-key
```

## Restore

Restore is destructive and requires both an archive path and the exact installation UUID shown in its manifest. Schedule downtime, take a separate snapshot of the current server, and confirm that the recovery key and sidecar are present.

```bash
docker compose --env-file release.env -f compose.production.yml --profile operations run --rm \
  --entrypoint /opt/reservation-tools/scripts/production/restore.sh \
  reservation-operations \
  --archive /backups/<archive>.tar.age \
  --confirm-restore <installation-uuid>
```

The restore verifies the encrypted archive before stopping public/application services, restores into a fresh `reservation` database while retaining the prior database under a temporary name, restores the source installation identity, protected application/session/internal keys, and WhatsApp state, republishes scoped service secrets, starts services, and runs the production readiness smoke. The previous database is dropped only after smoke succeeds. Any failure after the database swap rolls the prior database, protected identity/keys, and WhatsApp state back before restarting the previous services.

Restore only onto tooling that supports the archive migration version. The verifier derives the maximum supported version from the immutable migration index shipped in the tools image.

## Required drill

Before release, complete [the restore drill record](../release-evidence/phase-5-restore-drill.md) on a disposable installation. Static tests validate rejection and integrity logic, but they are not evidence that Docker volumes, external storage, DNS, and the real PostgreSQL dataset restore correctly.

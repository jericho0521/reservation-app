# Recover a production installation

Use this guide when normal service checks do not recover the installation. Restore and irreversible-upgrade recovery cause downtime and require the exact installation identity.

## First, identify the failure boundary

1. Open **System status** if the console is available.
2. From `/opt/reservation-platform`, inspect `docker compose ... ps --all` and only the bounded logs for the failing service.
3. Confirm DNS and HTTPS independently from database and worker health.
4. Generate a sanitized support bundle before destructive recovery when possible.

Restart an unhealthy application service only after its database, migrations, and protected configuration dependencies are healthy. Never delete a volume or edit the migration ledger to make a check green.

## Restore a verified backup

Confirm all of the following before proceeding:

- the encrypted `.tar.age` archive and SHA-256 sidecar are available;
- the independent recovery key is available;
- the archive was created by this installation and its migration is supported;
- the exact installation UUID is known;
- an outage window and current-server snapshot are approved.

Run the supported operations-profile restore command from [Encrypted backup and verified restore](../operations/backup-restore.md). The restore verifies before changing service state, retains the previous database during smoke validation, and rolls back protected state if the smoke check fails.

## Recover a failed irreversible upgrade

If an upgrade reports that rollback is incompatible, keep public traffic stopped. Use the verified pre-upgrade archive and the explicit `recover-upgrade.sh` workflow in [Versioned upgrades and recovery](../operations/upgrades.md). Do not restart a mixture of old images and a newer database.

After recovery, verify readiness, public booking, owner login, worker heartbeat, email/AI/WhatsApp status, and one safe customer-management read. Create a new verified off-host backup before declaring the incident closed.

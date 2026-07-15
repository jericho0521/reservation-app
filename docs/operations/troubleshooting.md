# Troubleshoot a Production Installation

This guide is for the operator of one business installation. Use the owner console for business integrations and SSH only for host-level recovery. Do not paste raw logs, environment output, QR payloads, cookies, or customer records into a support request.

## Reconnect WhatsApp

1. Open **Channels & AI** in the owner console and read the WhatsApp session state.
2. If the state is degraded, select **Reconnect session** and allow one worker heartbeat interval.
3. If the session is disconnected or expired, select **Start QR pairing** and scan the code from the linked phone. Keep the owner-only page open until it reports connected.
4. Send a test message and confirm that it appears in **Conversations**.
5. If pairing repeatedly expires, select **Disconnect session**, unlink the old linked device from the phone, and start pairing again.

The QR is short-lived, owner-only, and never written to application logs or the support bundle.

## Rotate AI credentials

1. Open **AI provider** and leave automation disabled while changing credentials.
2. Enter the replacement key in the write-only field, confirm the provider URL and model, and select **Save AI settings**.
3. Select **Test connection**.
4. Enable automation only after the test succeeds.
5. Revoke the superseded key at the provider.

For a suspected compromise, reverse the safety order: revoke the key at the provider immediately, use **Revoke API key** in the console, then create, save, and test a replacement.

## Rotate email credentials

1. Open **Email delivery** and temporarily disable delivery.
2. Enter the replacement SMTP username and password together, confirm host, port, TLS mode, and sender address, then select **Save email settings**.
3. Select **Send test email**.
4. Re-enable delivery only after the test arrives.
5. Revoke the superseded SMTP credential at the provider.

Saved provider secrets are write-only: leaving credential fields blank preserves the stored value, and no status or support response returns it.

## Recover notification delivery

Retryable notification failures are requeued automatically with bounded backoff. There is no owner-facing command to requeue a terminal failed job.

1. Fix the email configuration or provider outage first and complete **Send test email** successfully.
2. Confirm **Background worker** is healthy and its heartbeat is current on **System status**.
3. Allow pending retryable jobs to drain; confirm the pending count and oldest age decrease.
4. If the failed count increases, generate a support bundle and use its safe `error_code` values to distinguish provider, recipient, and exhausted-retry failures.
5. Contact affected customers through an approved manual channel for terminal failures. Do not edit job leases, attempts, delivery rows, or encrypted payloads directly.

## Handle low disk space

1. Pause nonessential administrative changes if the disk card is offline.
2. Check capacity with `df -h`; do not delete database, protected-config, or WhatsApp volumes.
3. Remove expired support bundles and old backup archives only after confirming the retained backups are verified and copied off-host under the business retention policy.
4. Expand the host disk when retained backups and current application data account for the usage.
5. Confirm readiness, then create and verify a fresh backup.

Do not use `docker system prune --volumes` on a reservation-platform host.

## Create, verify, or restore a backup

Follow [Encrypted Backup and Verified Restore](backup-restore.md). A backup is successful only after archive decryption, manifest validation, and database checksum verification pass. Copy the archive and SHA-256 sidecar off-host while keeping the recovery key separate from both.

A restore is destructive. Restore into the guarded workflow, preserve the previous database until readiness and smoke pass, and never overwrite the only live copy to test an archive.

## Recover a failed upgrade

Follow [Versioned Upgrades and Recovery](upgrades.md). A compatible failed release restarts the previous digest-pinned images. An incompatible migration requires the explicit recovery wrapper and the verified pre-upgrade archive; the upgrade tool never restores it automatically.

Do not edit `release.env`, substitute a `latest` image, expose the target edge before readiness, or rerun a failed irreversible migration without the recovery procedure.

## Generate a sanitized support bundle

Run the tool through the disabled-by-default production operations service. The service uses the digest-pinned tools image and the fixed installation mount for Compose metadata collection; the resulting archive is written to the host backup directory.

```bash
cd /opt/reservation-platform
sudo docker compose --env-file release.env -f compose.production.yml --profile operations run --rm \
  --entrypoint /opt/reservation-tools/scripts/production/support-bundle.sh \
  reservation-operations \
  --install-dir /opt/reservation-installation \
  --output /backups/reservation-support.tar.gz
sudo tar -tzf /var/backups/reservation-platform/reservation-support.tar.gz
```

The archive is mode `0600` and contains only:

- release and migration versions;
- allowlisted Compose service, image, state, and health fields;
- sanitized public readiness state;
- pending/failed queue counts and oldest pending age;
- a numeric disk summary;
- boolean AI, email, and WhatsApp configuration-presence flags; and
- at most 500 structured warning/error entries with allowlisted codes and metadata.

It excludes environment values, authorization headers, provider keys, cookies, session tokens, QR payloads, prompts, message bodies, customer names, contact details, and raw provider/database errors. It never runs an unfiltered container inspection. The operations container exits after writing the archive; delete the host copy after the approved transfer and retention step.

## Revoke a compromised session or provider key

- **Staff account:** Open **Staff access** as the owner and disable the account. Disabling it revokes that staff member’s active sessions.
- **Owner account:** Use **Reset your password** from the login page and complete the one-time link. Completing the reset revokes every existing owner session. If reset email is unavailable, treat this as an incident requiring controlled administrative recovery; do not modify session rows ad hoc.
- **AI key:** Revoke it at the provider first, then select **Revoke API key** in **AI provider** before saving a replacement.
- **Email credential:** Revoke or reset it at the SMTP provider first, save both replacement authentication fields, send a test email, and only then re-enable delivery.
- **WhatsApp device:** Select **Disconnect session**, remove the linked device on the phone, and pair again only after the account is secured.

After containment, review safe operational timestamps and error codes, rotate any credential that shared the compromised device or provider account, and generate a sanitized bundle only if further diagnosis is required.

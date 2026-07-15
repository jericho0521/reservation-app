# Interpret System Status

Use this guide when the owner console reports a degraded component or a customer-facing channel stops responding. Open **System status** from the owner navigation. Staff accounts cannot access installation-wide status.

## Read the summary

The page shows the running release, applied migration version, generation time, job counts, and one card per component. It deliberately shows a safe recovery action instead of raw provider or database errors.

- **Healthy** means the latest check passed.
- **Degraded** means the platform can still perform some work, but the displayed operator action is required.
- **Offline** means a required dependency cannot be reached or a heartbeat is stale.

The overall state is the worst component state. Public liveness only proves that the API process answers; readiness is the traffic gate and checks database and migration safety. A degraded optional integration does not by itself make the public readiness endpoint fail.

| Component | What the card represents | First response |
| --- | --- | --- |
| Database | API database connectivity | Check the database container before restarting application services. |
| Migrations | Applied migration safety | Run the indexed production migration service; never edit the ledger manually. |
| Background worker | Worker heartbeat, stale after 45 seconds | Check the worker container and safe recent error codes. |
| Email | Saved and enabled email integration | Test the SMTP configuration and rotate invalid credentials. |
| AI | Saved and enabled AI integration | Test the provider and rotate or revoke an invalid key. |
| WhatsApp | Durable linked-device session state | Reconnect or start a new QR pairing from **Channels & AI**. |
| Disk | Host disk usage | Free approved expendable files or expand the volume. |
| Backup | Most recent verified encrypted backup | Create and verify a backup, then copy it off-host. |

`last_success_at` appears only when a successful timestamp has been recorded. “No successful check recorded” is not a raw failure message; follow the card action and the relevant troubleshooting section.

## Check the installation from SSH

Run the Compose command from the supported installation directory so it uses the pinned release values:

```bash
cd /opt/reservation-platform
sudo docker compose --env-file release.env -f compose.production.yml ps --all
curl --fail --silent https://your-domain.example/v1/health/live
curl --fail --silent https://your-domain.example/v1/health/ready
```

The worker writes a heartbeat every 15 seconds. Allow one interval after a successful restart before refreshing **System status**. If it remains offline after 45 seconds, use the worker recovery steps in [Production Troubleshooting](troubleshooting.md).

## Prioritize alerts

Handle alerts in this order:

1. Database offline or migration mismatch.
2. Worker offline or an increasing failed-job count.
3. Critically low disk space.
4. No verified off-host backup.
5. Disconnected WhatsApp.
6. Email or AI integration failure.

Generate a sanitized support bundle when the card action and runbook do not resolve the incident. Safe recent error codes are in the bundle; raw application logs, customer messages, and provider responses are not.

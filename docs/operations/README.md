# Operations

Operational docs for running, deploying, and checking the backend platform.

| Document | Use It For |
| --- | --- |
| [Production Installation](production-install.md) | Install one appointment business from prebuilt images on a clean Ubuntu VPS. |
| [Backend Deployment](backend-deployment.md) | Docker-first backend builds, local container runs, hosted container guidance, env, CORS, health checks, and migration guidance. |
| [Encrypted Backup and Verified Restore](backup-restore.md) | Create, verify, transfer, and safely restore encrypted installation backups. |
| [Versioned Upgrades and Recovery](upgrades.md) | Apply digest-pinned releases and recover a failed readiness gate. |
| [URLs and Hosting Reference](urls-and-hosting-reference.md) | Known local, hosted, Supabase, Cloudflare Tunnel, and server URLs retained from the original deployment setup. |
| [Server Restart Checklist](server-restart-checklist.md) | Short post-reboot checks for Docker, Cloudflare Tunnel, and Supabase health. |
| [System Status](system-status.md) | Interpret health states, prioritize alerts, and select the right recovery action. |
| [Production Troubleshooting](troubleshooting.md) | Recover channels and integrations, handle failed jobs or low disk, and generate a sanitized support bundle. |

Keep new files here lowercase kebab-case, for example `rollback-runbook.md` or
`production-release-checklist.md`.

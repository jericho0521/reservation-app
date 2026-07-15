# Full-Day Non-Developer Acceptance Template

Use this template only for a real run by an operator who did not implement the platform. Record synthetic or redacted evidence. Never record credentials, contact details, message bodies, QR payloads, recovery keys, or session values.

The run must span at least eight hours and complete every task identifier below. Replace the pending values only with observed release evidence.

```acceptance-evidence
{
  "schema_version": 1,
  "evidence_status": "pending",
  "release_version": "pending",
  "commit_sha": "pending",
  "migration_version": "pending",
  "image_digests": { "api": "pending", "worker": "pending", "console": "pending", "booking": "pending", "tools": "pending" },
  "operator": { "role": "pending", "background": "pending", "independent": false, "signature": "pending", "signed_at": null },
  "started_at": null,
  "ended_at": null,
  "tasks_completed": [],
  "incidents": [],
  "recovery_actions": [],
  "counts": { "reservations": null, "messages": null, "jobs": null },
  "backup": { "id": "pending", "checksum": "pending" },
  "verdict": "pending"
}
```

Required task identifiers: `install`, `owner_setup`, `recovery_key_export`, `business_configuration`, `email_test`, `ai_booking`, `whatsapp_booking`, `web_booking`, `customer_reschedule`, `customer_cancel`, `staff_create`, `staff_reschedule`, `staff_complete`, `staff_no_show`, `takeover_resume`, `api_restart`, `worker_restart`, `notification_retry`, and `verified_backup`.

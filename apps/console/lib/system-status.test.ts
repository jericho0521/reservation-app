import assert from "node:assert/strict";
import test from "node:test";
import type { SystemStatusResponse } from "@reservation-platform/sdk";
import { buildSystemAttentionItems } from "./system-status.js";

test("system attention prioritizes failed jobs and actionable offline components", () => {
  const healthy = { status: "healthy", action: "No action." } as const;
  const status: SystemStatusResponse = { generated_at: "2026-07-15T00:00:00Z", status: "offline", release_version: "1.0.0", migration_version: "000035", components: { database: healthy, migrations: healthy, worker: { status: "offline", action: "Restart worker." }, email: healthy, ai: healthy, whatsapp: healthy, disk: healthy, backup: healthy }, jobs: { pending: 2, failed: 1, oldest_age_seconds: 10 } };
  assert.deepEqual(buildSystemAttentionItems(status).map((item) => item.label), ["1 failed job", "Background worker"]);
});

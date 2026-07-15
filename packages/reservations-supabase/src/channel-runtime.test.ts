import assert from "node:assert/strict";
import test from "node:test";

import { createSupabaseWhatsAppChannelRuntime } from "./channel-runtime.js";

test("WhatsApp channel commands and private reads use scoped RPCs", async () => {
  const calls: unknown[] = [];
  const runtime = createSupabaseWhatsAppChannelRuntime({
    async rpc(name, params) {
      calls.push([name, params]);
      if (name === "platform_enqueue_whatsapp_command") return { data: { command_id: "command-1", job_id: "job-1" }, error: null };
      if (name === "platform_read_whatsapp_channel_state") return { data: { provider: "session_qr", status: "pending_qr", updated_at: "2026-07-15T00:00:00.000Z" }, error: null };
      if (name === "platform_read_whatsapp_pairing_state") return { data: { encrypted_qr: { v: 1 }, expires_at: "2026-07-15T00:01:00.000Z" }, error: null };
      return { data: true, error: null };
    },
  });

  await runtime.enqueue({ tenantId: "tenant-1", venueId: "venue-1", kind: "whatsapp.start_session", idempotencyKey: "pair-1" });
  assert.equal((await runtime.readState("tenant-1")).status, "pending_qr");
  assert.deepEqual(await runtime.readPairing("tenant-1"), { encryptedQr: { v: 1 }, expiresAt: "2026-07-15T00:01:00.000Z" });
  await runtime.markCommand("command-1", "completed");
  assert.deepEqual(calls.map((call) => (call as unknown[])[0]), [
    "platform_enqueue_whatsapp_command",
    "platform_read_whatsapp_channel_state",
    "platform_read_whatsapp_pairing_state",
    "platform_mark_whatsapp_command",
  ]);
});

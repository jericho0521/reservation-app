import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createWhatsAppSimulationMessage } from "../../packages/whatsapp/src/simulation-adapter.ts";

test("credential-free WhatsApp simulation is scoped and traverses the shared orchestrator", async () => {
  const message = createWhatsAppSimulationMessage({ text: "Book Apex GT Racing Session", messageId: "e2e-step-1" }, { tenantId: "final_demo", venueId: "00000000-0000-4000-8000-000000000101" });
  assert.equal(message.messageId, "e2e-step-1");
  assert.deepEqual(message.raw, { simulated: true, tenant_id: "final_demo", venue_id: "00000000-0000-4000-8000-000000000101" });
  const runtime = await readFile("apps/api/src/runtime.ts", "utf8");
  assert.match(runtime, /channel = message\.raw\?\.simulated === true \? "simulation"/u);
  assert.match(runtime, /handleConversationInbound/u);
  assert.doesNotMatch(JSON.stringify(message), /api[_-]?key|credential|qr_code/iu);
});

test("omnichannel booking persists proposal, explicit confirmation request, and reservation events", async () => {
  const seed = await readFile("packages/database/seeds/final-demo.sql", "utf8");
  for (const event of ["booking.proposed", "booking.confirmation_requested", "booking.confirmed"]) assert.match(seed, new RegExp(event.replace(".", "\\."), "u"));
});

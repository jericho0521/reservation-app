import assert from "node:assert/strict";
import test from "node:test";

import { createWhatsAppSimulationMessage } from "./simulation-adapter";

test("simulation messages are deterministic, scoped, and require no credentials", () => {
  const first = createWhatsAppSimulationMessage({ text: "  Book a room  ", phone: "+60111111111" }, { tenantId: "tenant_1", venueId: "venue_1" });
  const second = createWhatsAppSimulationMessage({ text: "Book a room", phone: "+60111111111" }, { tenantId: "tenant_1", venueId: "venue_1" });
  assert.equal(first.messageId, second.messageId);
  assert.equal(first.text, "Book a room");
  assert.deepEqual(first.raw, { simulated: true, tenant_id: "tenant_1", venue_id: "venue_1" });
  assert.equal(first.provider, "session_qr");
});

test("simulation accepts an explicit message id for repeatable scripted demos", () => {
  assert.equal(createWhatsAppSimulationMessage({ text: "Confirm", messageId: "demo-step-2" }).messageId, "demo-step-2");
  assert.throws(() => createWhatsAppSimulationMessage({ text: "   " }), /required/u);
});

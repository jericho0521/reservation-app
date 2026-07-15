import assert from "node:assert/strict";
import test from "node:test";
import { PlatformError, type WhatsAppChannelReadinessResponse, type WhatsAppOwnerSessionResponse } from "@reservation-platform/sdk";
import { canStartWhatsAppSession, describeWhatsAppSession, resolveChannelPageState } from "./channel-page-state";

const readiness: WhatsAppChannelReadinessResponse = {
  enabled: true,
  provider: "session_qr",
  simulation_enabled: true,
  production_ready: true,
  missing_requirements: [],
  ai: { configured: true, connected: true, healthy: true, message: "Ready." },
  whatsapp: { configured: true, connected: true, healthy: true, message: "Ready." },
};
const session: WhatsAppOwnerSessionResponse = {
  provider: "session_qr",
  status: "connected",
  updated_at: "2026-07-13T00:00:00.000Z",
};

test("channel page preserves successful readiness and session data", () => {
  assert.deepEqual(resolveChannelPageState(
    { status: "fulfilled", value: readiness },
    { status: "fulfilled", value: session },
  ), { readiness, session });
});

test("disabled WhatsApp renders an explicit degraded state instead of a console setup failure", () => {
  const disabled = new PlatformError({ code: "whatsapp_module_disabled", message: "WhatsApp module is disabled.", status: 404 });
  const state = resolveChannelPageState(
    { status: "rejected", reason: disabled },
    { status: "rejected", reason: disabled },
  );
  assert.equal(state.readiness.enabled, false);
  assert.equal(state.readiness.whatsapp.configured, false);
  assert.equal(state.session.status, "disabled");
});

test("channel page still fails closed for unexpected readiness errors", () => {
  const failure = new PlatformError({ code: "internal_error", message: "Unavailable.", status: 500 });
  assert.throws(() => resolveChannelPageState(
    { status: "rejected", reason: failure },
    { status: "fulfilled", value: session },
  ), (error) => error === failure);
});

test("QR pairing is offered only for sessions that can start", () => {
  assert.equal(canStartWhatsAppSession("disconnected"), true);
  assert.equal(canStartWhatsAppSession("expired"), true);
  assert.equal(canStartWhatsAppSession("disabled"), false);
  assert.equal(canStartWhatsAppSession("pending_qr"), false);
  assert.equal(canStartWhatsAppSession("connected"), false);
});

test("WhatsApp session presentation covers every operational state", () => {
  const unhealthy = { ...readiness, production_ready: false, whatsapp: { ...readiness.whatsapp, connected: false, healthy: false, message: "Connection health check failed." } };
  const cases = [
    ["disabled", resolveChannelPageState(
      { status: "rejected", reason: new PlatformError({ code: "whatsapp_module_disabled", message: "disabled", status: 404 }) },
      { status: "rejected", reason: new PlatformError({ code: "whatsapp_module_disabled", message: "disabled", status: 404 }) },
    ).session, { ...readiness, enabled: false }, false],
    ["disconnected", { ...session, status: "disconnected" }, readiness, false],
    ["pairing", { ...session, status: "pending_qr" }, readiness, false],
    ["qr", { ...session, status: "pending_qr" }, readiness, true],
    ["connected", session, readiness, false],
    ["reconnecting", { ...session, metadata: { connection_state: "reconnecting" } }, unhealthy, false],
    ["degraded", session, unhealthy, false],
    ["expired", { ...session, status: "expired" }, unhealthy, false],
  ] as const;

  for (const [expected, currentSession, currentReadiness, qrAvailable] of cases) {
    const view = describeWhatsAppSession(currentReadiness, currentSession, qrAvailable);
    assert.equal(view.state, expected);
    assert.ok(view.title.length > 0);
    assert.ok(view.description.length > 0);
  }
});

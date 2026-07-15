import assert from "node:assert/strict";
import test from "node:test";

import { safeLogValue, safeStructuredLogEntry } from "./safe-logger.js";

test("safe logger redacts nested credentials and customer message content", () => {
  assert.deepEqual(safeLogValue({
    authorization: "Bearer secret",
    nested: { qr_code: "private", content: "customer text", error_code: "timeout" },
    cookie: "session=secret",
  }), {
    authorization: "[REDACTED]",
    nested: { qr_code: "[REDACTED]", content: "[REDACTED]", error_code: "timeout" },
    cookie: "[REDACTED]",
  });
});

test("structured logger emits only bounded allowlisted fields", () => {
  const result = safeStructuredLogEntry({
    level: "error",
    event: "job_failed",
    component: "worker",
    errorCode: "network_error",
    jobKind: "notification.email",
    attempts: 2,
    counts: { failed: 1, "unsafe key": 99 },
  });
  assert.deepEqual(result, {
    level: "error",
    event: "job_failed",
    component: "worker",
    errorCode: "network_error",
    jobKind: "notification.email",
    attempts: 2,
    counts: { failed: 1 },
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  PlatformJobProcessingError,
  classifyPlatformJobError,
  nextRetryAt,
} from "./jobs.js";

test("retry delay uses bounded exponential backoff", () => {
  const now = new Date("2026-07-15T00:00:00.000Z");

  assert.equal(nextRetryAt(now, 0), "2026-07-15T00:00:15.000Z");
  assert.equal(nextRetryAt(now, 1), "2026-07-15T00:00:30.000Z");
  assert.equal(nextRetryAt(now, 20), "2026-07-15T01:00:00.000Z");
});

test("only explicitly declared error codes are transient", () => {
  assert.deepEqual(
    classifyPlatformJobError(new PlatformJobProcessingError("provider_unavailable")),
    { code: "provider_unavailable", transient: true },
  );
  assert.deepEqual(
    classifyPlatformJobError(new PlatformJobProcessingError("invalid_recipient")),
    { code: "invalid_recipient", transient: false },
  );
  assert.deepEqual(classifyPlatformJobError(new Error("secret provider detail")), {
    code: "job_handler_failed",
    transient: false,
  });
});

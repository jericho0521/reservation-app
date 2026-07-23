import assert from "node:assert/strict";
import test from "node:test";
import {
  beginIdempotentMutation,
  commitIdempotentMutation,
  createJsonRequestFingerprint,
  releaseIdempotentMutation,
  requireIdempotencyKey,
  type IdempotencyRecord,
  type IdempotencyRepository,
} from "./idempotency.js";

class InMemoryIdempotencyRepository implements IdempotencyRepository {
  records = new Map<string, IdempotencyRecord>();

  claimInProgress(record: IdempotencyRecord) {
    const existing = this.records.get(record.key);
    if (existing) {
      return existing;
    }
    this.records.set(record.key, record);
    return null;
  }

  storeCompleted(record: IdempotencyRecord) {
    this.records.set(record.key, record);
  }

  releaseInProgress(token: { key: string }) {
    this.records.delete(token.key);
  }
}

const baseInput = {
  key: "idem_123",
  tenantId: "tenant_123",
  method: "POST",
  path: "/v1/reservations",
  fingerprint: createJsonRequestFingerprint({ service_id: "svc_123", quantity: 2 }),
};

test("requireIdempotencyKey trims present keys", () => {
  assert.deepEqual(requireIdempotencyKey(" idem_123 "), {
    ok: true,
    key: "idem_123",
  });
});

test("requireIdempotencyKey rejects missing keys with platform error body", () => {
  assert.deepEqual(requireIdempotencyKey(" "), {
    ok: false,
    status: 400,
    body: {
      error: {
        code: "missing_idempotency_key",
        message: "Missing Idempotency-Key header for mutation.",
        status: 400,
        idempotency: { status: "rejected" },
      },
    },
  });
});

test("idempotent mutation rejects a missing key", async () => {
  const result = await beginIdempotentMutation(new InMemoryIdempotencyRepository(), {
    ...baseInput,
    key: " ",
  });

  assert.equal(result.action, "reject");
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, "missing_idempotency_key");
});

test("idempotent mutation proceeds and stores an in-progress token for a first key", async () => {
  const repository = new InMemoryIdempotencyRepository();

  const result = await beginIdempotentMutation(repository, baseInput);

  assert.equal(result.action, "proceed");
  assert.equal(repository.records.get("idem_123")?.status, "in_progress");
});

test("idempotent mutation treats duplicate claim winners as existing in-progress requests", async () => {
  const repository: IdempotencyRepository = {
    claimInProgress(record) {
      return record;
    },
    storeCompleted() {
      throw new Error("should not store completed response");
    },
    releaseInProgress() {
      throw new Error("should not release in-progress response");
    },
  };

  const result = await beginIdempotentMutation(repository, baseInput);

  assert.equal(result.action, "reject");
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, "conflict");
});

test("idempotent mutation replays a completed matching response", async () => {
  const repository = new InMemoryIdempotencyRepository();
  const first = await beginIdempotentMutation(repository, baseInput);
  assert.equal(first.action, "proceed");

  await commitIdempotentMutation(repository, first.token, {
    status: 201,
    body: { reservation_id: "res_123" },
  });

  const replay = await beginIdempotentMutation(repository, baseInput);

  assert.deepEqual(replay, {
    action: "replay",
    status: 201,
    body: { reservation_id: "res_123" },
  });
});

test("idempotent mutation normalizes stored methods when matching replay records", async () => {
  const repository = new InMemoryIdempotencyRepository();
  repository.records.set("idem_123", {
    key: "idem_123",
    tenantId: "tenant_123",
    method: "post",
    path: "/v1/reservations",
    fingerprint: baseInput.fingerprint,
    status: "completed",
    response: {
      status: 201,
      body: { reservation_id: "res_123" },
    },
  });

  const replay = await beginIdempotentMutation(repository, baseInput);

  assert.equal(replay.action, "replay");
  assert.equal(replay.status, 201);
});

test("idempotent mutation rejects same key with a different fingerprint", async () => {
  const repository = new InMemoryIdempotencyRepository();
  await beginIdempotentMutation(repository, baseInput);

  const result = await beginIdempotentMutation(repository, {
    ...baseInput,
    fingerprint: createJsonRequestFingerprint({ service_id: "svc_123", quantity: 3 }),
  });

  assert.equal(result.action, "reject");
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, "idempotency_key_reused_with_different_request");
});

test("idempotent mutation rejects same key with a different tenant", async () => {
  const repository = new InMemoryIdempotencyRepository();
  await beginIdempotentMutation(repository, baseInput);

  const result = await beginIdempotentMutation(repository, {
    ...baseInput,
    tenantId: "tenant_other",
  });

  assert.equal(result.action, "reject");
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, "idempotency_key_reused_with_different_request");
});

test("idempotent mutation rejects a matching in-progress request", async () => {
  const repository = new InMemoryIdempotencyRepository();
  await beginIdempotentMutation(repository, baseInput);

  const result = await beginIdempotentMutation(repository, baseInput);

  assert.equal(result.action, "reject");
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, "conflict");
});

test("releasing an in-progress mutation allows the same request to be claimed again", async () => {
  const repository = new InMemoryIdempotencyRepository();
  const first = await beginIdempotentMutation(repository, baseInput);
  assert.equal(first.action, "proceed");

  await releaseIdempotentMutation(repository, first.token);
  const retry = await beginIdempotentMutation(repository, baseInput);

  assert.equal(retry.action, "proceed");
});

test("JSON request fingerprints canonicalize object key order while preserving array order", () => {
  assert.equal(
    createJsonRequestFingerprint({
      b: 2,
      a: { d: null, c: [3, { z: true, y: false }] },
    }),
    createJsonRequestFingerprint({
      a: { c: [3, { y: false, z: true }], d: null },
      b: 2,
    }),
  );

  assert.notEqual(
    createJsonRequestFingerprint({ values: [1, 2] }),
    createJsonRequestFingerprint({ values: [2, 1] }),
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { requiredNodeEngine, verifyNodeRuntimePolicy } from "./verify-node-runtime-policy.mjs";

test("accepts the repository Node 24 engine policy", () => {
  assert.deepEqual(verifyNodeRuntimePolicy([
    { path: "package.json", manifest: { engines: { node: requiredNodeEngine } } },
  ]), []);
});

test("rejects missing and drifting Node engine ranges", () => {
  assert.deepEqual(verifyNodeRuntimePolicy([
    { path: "missing/package.json", manifest: {} },
    { path: "old/package.json", manifest: { engines: { node: ">=20" } } },
  ]), [
    `missing/package.json must declare engines.node as ${requiredNodeEngine}`,
    `old/package.json must declare engines.node as ${requiredNodeEngine}`,
  ]);
});

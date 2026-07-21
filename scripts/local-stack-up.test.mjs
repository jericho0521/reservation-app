import assert from "node:assert/strict";
import test from "node:test";

import { runLocalStackUp, setupDiagnosticServices } from "./local-stack-up.mjs";

test("stack up remains a single Compose call when startup succeeds", () => {
  const calls = [];
  const status = runLocalStackUp({
    run(command, args) {
      calls.push([command, args]);
      return { status: 0 };
    },
  });

  assert.equal(status, 0);
  assert.deepEqual(calls, [["docker", ["compose", "up", "--build", "-d"]]]);
});

test("stack up prints setup diagnostics automatically when Compose fails", () => {
  const calls = [];
  const status = runLocalStackUp({
    run(command, args) {
      calls.push([command, args]);
      return { status: calls.length === 1 ? 1 : 0 };
    },
  });

  assert.equal(status, 1);
  assert.deepEqual(calls[1], [
    "docker",
    ["compose", "logs", "--no-color", "--tail", "200", ...setupDiagnosticServices],
  ]);
});

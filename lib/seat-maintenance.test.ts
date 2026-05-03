import assert from "node:assert/strict";
import test from "node:test";
import {
  getMaintenanceSeatConflicts,
  normalizeSeatLabel,
  normalizeSeatLabels,
} from "./seat-maintenance";

test("normalizeSeatLabel formats racing simulator labels", () => {
  assert.equal(normalizeSeatLabel("rs1"), "RS1");
  assert.equal(normalizeSeatLabel("RS 12"), "RS12");
});

test("normalizeSeatLabel rejects unsupported seat labels", () => {
  assert.equal(normalizeSeatLabel("PS1"), null);
  assert.equal(normalizeSeatLabel("RS0"), null);
  assert.equal(normalizeSeatLabel("RS17"), null);
});

test("normalizeSeatLabels deduplicates and sorts labels", () => {
  assert.deepEqual(normalizeSeatLabels(["rs3", "RS1", "RS3", "RS2"]), ["RS1", "RS2", "RS3"]);
});

test("getMaintenanceSeatConflicts returns requested blocked seats", () => {
  assert.deepEqual(
    getMaintenanceSeatConflicts(["RS1", "RS4"], ["RS2", "RS4", "RS8"]),
    ["RS4"],
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { cn } from "./class-names.js";
import { defaultBookingLabels } from "./types.js";

test("cn joins truthy class names", () => {
  assert.equal(cn("a", false, undefined, "b"), "a b");
});

test("default labels expose required booking fields", () => {
  assert.equal(defaultBookingLabels.resource, "Resource");
  assert.equal(defaultBookingLabels.customerName, "Name");
});

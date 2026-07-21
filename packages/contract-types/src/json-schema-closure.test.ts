import assert from "node:assert/strict";
import test from "node:test";
import { collectReachableJsonSchemaDefinitions } from "./json-schema-closure.js";

test("collects only transitive JSON Schema dependencies in registry order", () => {
  const definitions = {
    Leaf: { type: "string" },
    Unrelated: { type: "number" },
    Child: { type: "array", items: { $ref: "#/$defs/Leaf" } },
    Root: {
      oneOf: [
        { $ref: "#/$defs/Child" },
        { type: "object", properties: { recursive: { $ref: "#/$defs/Root" } } },
      ],
    },
  };

  assert.deepEqual(
    Object.keys(collectReachableJsonSchemaDefinitions("Root", definitions)),
    ["Leaf", "Child", "Root"],
  );
});

test("rejects an unregistered transitive definition", () => {
  assert.throws(
    () => collectReachableJsonSchemaDefinitions("Root", {
      Root: { $ref: "#/$defs/Missing" },
    }),
    /Missing is not registered/u,
  );
});

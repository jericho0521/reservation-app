import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "./route";

test("GET /api/v1/metadata exposes platform metadata", async () => {
  const response = await GET();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    api_version: "v1",
    modules: ["reservations"],
    compatibility: {
      notices: [
        "Initial Next.js compatibility implementation for the backend platform /v1 contract.",
        "Resource maintenance list/create/end are available in compatibility mode; bulk replace is implemented by the frontend wrapper until the backend platform exposes a first-class bulk endpoint.",
      ],
    },
  });
});

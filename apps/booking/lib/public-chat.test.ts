import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public chat route requires published channel enablement and uses browser-safe packages", async () => {
  const route = await readFile(new URL("../app/[slug]/chat/page.tsx", import.meta.url), "utf8");
  const component = await readFile(new URL("../components/public-chat.tsx", import.meta.url), "utf8");
  assert.match(route, /configuration\.channels\.web_chat/u);
  assert.match(component, /usePublicChat/u);
  assert.doesNotMatch(component, /supabase|service.role|RESERVATION_SUPABASE/ui);
});

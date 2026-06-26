import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { verifyBackendPlatformExtractionBoundary } from "./verify-backend-platform-extraction-boundary.mjs";

async function createFixtureRepo(files) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), "backend-platform-boundary-"));

  for (const [repoPath, content] of Object.entries(files)) {
    const filePath = path.join(repoRoot, repoPath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content);
  }

  return repoRoot;
}

async function verifyFixture(files) {
  const repoRoot = await createFixtureRepo(files);
  return verifyBackendPlatformExtractionBoundary({
    repoRoot,
    scanTargets: ["apps/api/src"],
  });
}

test("backend platform extraction boundary accepts the current repository source", async () => {
  const result = await verifyBackendPlatformExtractionBoundary();

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.ok(result.fileCount > 0);
});

test("backend platform extraction boundary rejects React and Next imports in apps/api", async () => {
  const result = await verifyFixture({
    "apps/api/src/frontend-imports.ts": [
      "import React from \"react\";",
      "import Image from \"next/image\";",
      "export const value = React.createElement(Image);",
      "",
    ].join("\n"),
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /imports forbidden React UI\/runtime import: react/);
  assert.match(result.failures.join("\n"), /imports forbidden frontend image component: next\/image/);
});

test("backend platform extraction boundary rejects browser Supabase and frontend platform wrappers in apps/api", async () => {
  const result = await verifyFixture({
    "apps/api/src/frontend-wrappers.ts": [
      "import { createBrowserClient } from \"@/lib/supabase-browser\";",
      "import { createReservationPlatformClient } from \"@/lib/reservation-platform-client\";",
      "export const clients = [createBrowserClient, createReservationPlatformClient];",
      "",
    ].join("\n"),
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /imports forbidden browser Supabase helper: @\/lib\/supabase-browser/);
  assert.match(
    result.failures.join("\n"),
    /imports forbidden frontend platform client wrapper: @\/lib\/reservation-platform-client/,
  );
});

test("backend platform extraction boundary rejects current app route and page imports in apps/api", async () => {
  const result = await verifyFixture({
    "apps/api/src/current-app-imports.ts": [
      "import HomePage from \"@/app/page\";",
      "import AdminPage from \"@/app/admin/page\";",
      "import ChatPage from \"@/app/chat-booking/page\";",
      "import FormPage from \"@/app/form-booking/page\";",
      "export const pages = [HomePage, AdminPage, ChatPage, FormPage];",
      "",
    ].join("\n"),
  });

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /imports forbidden frontend page surface: @\/app\/page/);
  assert.match(result.failures.join("\n"), /imports forbidden frontend admin UI surface: @\/app\/admin\/page/);
  assert.match(result.failures.join("\n"), /imports forbidden frontend chat page surface: @\/app\/chat-booking\/page/);
  assert.match(result.failures.join("\n"), /imports forbidden frontend booking page surface: @\/app\/form-booking\/page/);
});

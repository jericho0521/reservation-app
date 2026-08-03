import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PRODUCTION_APP_URL, getAppUrl } from "./app-url";

test("getAppUrl prefers an explicitly configured application URL", () => {
  assert.equal(
    getAppUrl({ NEXT_PUBLIC_APP_URL: "https://example.com/" }),
    "https://example.com",
  );
});

test("getAppUrl accepts Vercel's production hostname", () => {
  assert.equal(
    getAppUrl({
      VERCEL_PROJECT_PRODUCTION_URL: "reservation-app-eight-blond.vercel.app",
    }),
    DEFAULT_PRODUCTION_APP_URL,
  );
});

test("getAppUrl falls back to the verified production application", () => {
  assert.equal(getAppUrl({}), DEFAULT_PRODUCTION_APP_URL);
});

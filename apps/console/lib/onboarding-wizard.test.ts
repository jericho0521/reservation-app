import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const setupSteps = ["business", "location", "services", "staff", "hours", "channels", "review"] as const;

test("production onboarding has one server-backed page for every fixed step", async () => {
  const pages = await Promise.all(setupSteps.map((step) => (
    readFile(new URL(`../app/setup/${step}/page.tsx`, import.meta.url), "utf8")
  )));
  const loader = await readFile(new URL("./onboarding-loader.ts", import.meta.url), "utf8");

  for (const [index, source] of pages.entries()) {
    assert.match(source, new RegExp(`Business setup · ${index + 1} of 7`, "u"));
    assert.match(source, /loadOnboardingData/u);
    assert.doesNotMatch(source, /localStorage|sessionStorage/u);
  }
  assert.match(loader, /getInstallationBusiness/u);
  assert.match(loader, /listInstallationLocations/u);
  assert.match(loader, /venueId: business\.profile\.venue_id/u);
});

test("wizard actions save through platform APIs and redirect in the approved sequence", async () => {
  const actions = await readFile(new URL("../app/setup/actions.ts", import.meta.url), "utf8");

  for (const method of [
    "configureInstallationBusiness",
    "createInstallationLocation",
    "createExperienceService",
    "createExperienceResource",
    "updateExperienceOperatingHours",
    "updateExperienceChannelSettings",
    "publishExperienceDraft",
  ]) assert.match(actions, new RegExp(`\\.${method}\\(`, "u"));
  for (const step of ["location", "services", "staff", "hours", "channels", "review"]) {
    assert.match(actions, new RegExp(`redirect\\(\"/setup/${step}\"\\)`, "u"));
  }
  assert.match(actions, /redirect\("\/"\)/u);
});

test("production navigation exposes Business Setup and gates the preset catalogue", async () => {
  const [shell, studioPage, studioNavigation] = await Promise.all([
    readFile(new URL("../components/console-shell.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/studio/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/studio/studio-navigation.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(shell, />Business Setup</u);
  assert.doesNotMatch(shell, />Experience Studio</u);
  assert.match(studioPage, /RESERVATION_CONSOLE_PROFILE[^\n]+evaluation/u);
  assert.match(studioNavigation, /section\.id !== "preset"/u);
});

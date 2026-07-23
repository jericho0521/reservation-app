import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const setupSteps = ["business", "location", "services", "staff", "hours", "channels", "review"] as const;

test("production onboarding keeps server-backed pages for capacity and appointment sequences", async () => {
  const pages = await Promise.all(setupSteps.map((step) => (
    readFile(new URL(`../app/setup/${step}/page.tsx`, import.meta.url), "utf8")
  )));
  const loader = await readFile(new URL("./onboarding-loader.ts", import.meta.url), "utf8");

  for (const source of pages) {
    assert.match(source, /<SetupProgress/u);
    assert.match(source, /loadOnboardingData/u);
    assert.doesNotMatch(source, /localStorage|sessionStorage/u);
  }
  assert.match(loader, /getInstallationBusiness/u);
  assert.match(loader, /listInstallationLocations/u);
  assert.match(loader, /getEmailIntegrationSettings/u);
  assert.match(loader, /venueId: business\.profile\.venue_id/u);
  assert.match(loader, /presetId: "seat_capacity"/u);
  assert.match(loader, /presetId: business\.profile\.preset_id/u);
});

test("wizard actions save through platform APIs and branch by booking model", async () => {
  const actions = await readFile(new URL("../app/setup/actions.ts", import.meta.url), "utf8");

  for (const method of [
    "configureInstallationBusiness",
    "createExperienceService",
    "createExperienceResource",
    "updateExperienceOperatingHours",
    "updateExperienceChannelSettings",
    "publishExperienceDraft",
  ]) assert.match(actions, new RegExp(`\\.${method}\\(`, "u"));
  for (const step of ["location", "services", "staff", "hours", "channels", "review"]) {
    assert.match(actions, new RegExp(`"/setup/${step}"`, "u"));
  }
  assert.match(actions, /preset_id === "appointments_salon"/u);
  assert.match(actions, /resource_strategy"\) === "quantity"/u);
  assert.match(actions, /next_step"\) === "review"/u);
  assert.match(actions, /redirect\("\/"\)/u);
  assert.doesNotMatch(actions, /createInstallationLocation/u);
});

test("first-run setup does not offer an unusable second location", async () => {
  const locationPage = await readFile(new URL("../app/setup/location/page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(locationPage, /Add another location|createLocationSetupAction/u);
  assert.match(locationPage, /one fully usable location/u);
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

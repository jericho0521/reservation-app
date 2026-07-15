import { expect, test } from "@playwright/test";
import {
  consoleOrigin,
  hasConsoleAuthentication,
  openAuthenticatedConsole,
  originAvailable,
} from "./support/release-fixture";

test("staff appointment command center exposes create, filter, and schedule controls", async ({ page, request }) => {
  test.skip(!(await originAvailable(request, consoleOrigin)), "Console origin is not available.");
  test.skip(!hasConsoleAuthentication(), "Owner credentials or a storage state are required.");

  await openAuthenticatedConsole(page, "/admin/reservations");
  await expect(page.getByRole("heading", { name: "Operate the working day" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create an appointment" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create appointment" })).toBeVisible();
  await expect(page.getByLabel(/Date/u).first()).toBeVisible();
  await expect(page.getByLabel(/Status/u).first()).toBeVisible();
});

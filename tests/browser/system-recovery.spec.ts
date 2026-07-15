import { expect, test } from "@playwright/test";
import {
  consoleOrigin,
  hasConsoleAuthentication,
  openAuthenticatedConsole,
  originAvailable,
} from "./support/release-fixture";

test("owner sees safe system health and recovery guidance", async ({ page, request }) => {
  test.skip(!(await originAvailable(request, consoleOrigin)), "Console origin is not available.");
  test.skip(!hasConsoleAuthentication(), "Owner credentials or a storage state are required.");

  await openAuthenticatedConsole(page, "/admin/system");
  await expect(page.getByRole("heading", { name: "System status" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Job queue" })).toBeVisible();
  await expect(page.getByRole("region", { name: "System components" })).toBeVisible();
  await expect(page.getByText(/release .+ migration /u)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/password|service_role|Bearer /u);
});

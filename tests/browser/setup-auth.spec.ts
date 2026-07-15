import { expect, test } from "@playwright/test";
import {
  consoleOrigin,
  hasConsoleAuthentication,
  openAuthenticatedConsole,
  originAvailable,
} from "./support/release-fixture";

test("owner authentication and protected console boundary", async ({ page, request }) => {
  test.skip(!(await originAvailable(request, consoleOrigin)), "Console origin is not available.");

  await page.goto(`${consoleOrigin}/admin/login`);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toHaveAttribute("type", "email");
  await expect(page.getByLabel("Password")).toHaveAttribute("type", "password");
  await expect(page.getByRole("link", { name: "Forgot your password?" })).toBeVisible();

  test.skip(!hasConsoleAuthentication(), "Owner credentials or a storage state are required for the protected journey.");
  await openAuthenticatedConsole(page, "/admin");
  await expect(page.getByRole("navigation", { name: "Owner console" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Reservations" })).toBeVisible();
});

test("one-time setup link never renders its capability token", async ({ page, request }) => {
  test.skip(!(await originAvailable(request, consoleOrigin)), "Console origin is not available.");
  const setupToken = "A".repeat(43);

  await page.goto(`${consoleOrigin}/admin/setup?token=${setupToken}`);
  await expect(page.getByRole("heading", { name: "Infrastructure is ready" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create the first owner" })).toBeVisible();
  await expect(page).toHaveURL(`${consoleOrigin}/admin/setup`);
  await expect(page.getByText(setupToken, { exact: true })).toHaveCount(0);
});

import { expect, test } from "@playwright/test";
import {
  bookingOrigin,
  localBrowserFixtureAvailable,
  localBrowserManagementToken,
  localBrowserPublicSlug,
  originAvailable,
} from "./support/release-fixture";

const publicSlug = process.env.RESERVATION_BROWSER_PUBLIC_SLUG?.trim()
  || (localBrowserFixtureAvailable ? localBrowserPublicSlug : undefined);

test("customer can reach the shared public booking journey", async ({ page, request }) => {
  test.skip(!(await originAvailable(request, bookingOrigin)), "Booking origin is not available.");
  test.skip(!publicSlug, "RESERVATION_BROWSER_PUBLIC_SLUG is required for the public booking journey.");

  await page.goto(`${bookingOrigin}/${encodeURIComponent(publicSlug!)}/book`);
  await expect(page.getByRole("heading", { name: /Book /u })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose an experience" })).toBeVisible();
  await expect(page.getByLabel("Find a service")).toBeVisible();
});

test("booking management requires an explicit customer capability", async ({ page, request }) => {
  test.skip(!(await originAvailable(request, bookingOrigin)), "Booking origin is not available.");
  const managementPath = process.env.RESERVATION_BROWSER_MANAGEMENT_PATH?.trim()
    || (localBrowserFixtureAvailable
      ? `/${localBrowserPublicSlug}/manage/${localBrowserManagementToken}`
      : undefined);
  test.skip(!managementPath, "RESERVATION_BROWSER_MANAGEMENT_PATH is required for the management journey.");

  await page.goto(new URL(managementPath!, bookingOrigin).toString());
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/service.role|service_role|Bearer /u);
});

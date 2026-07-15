import { expect, test } from "@playwright/test";
import {
  consoleOrigin,
  hasConsoleAuthentication,
  localBrowserConversationId,
  localBrowserFixtureAvailable,
  mutationsEnabled,
  openAuthenticatedConsole,
  originAvailable,
} from "./support/release-fixture";

test.beforeEach(async ({ request }) => {
  test.skip(!(await originAvailable(request, consoleOrigin)), "Console origin is not available.");
  test.skip(!hasConsoleAuthentication(), "Owner credentials or a storage state are required.");
});

test("unified inbox offers channel filtering", async ({ page }) => {
  await openAuthenticatedConsole(page, "/admin/conversations");
  await expect(page.getByRole("heading", { name: "Every customer conversation" })).toBeVisible();
  await expect(page.getByLabel("Channel")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply" })).toBeVisible();
});

test("conversation takeover gates direct staff replies", async ({ page }) => {
  const conversationId = process.env.RESERVATION_BROWSER_CONVERSATION_ID?.trim()
    || (localBrowserFixtureAvailable ? localBrowserConversationId : undefined);
  test.skip(!conversationId, "RESERVATION_BROWSER_CONVERSATION_ID is required for takeover validation.");

  await openAuthenticatedConsole(page, `/admin/conversations/${encodeURIComponent(conversationId!)}`);
  const automatedHeading = page.getByRole("heading", { name: "Automation is active" });
  const manualHeading = page.getByRole("heading", { name: "You are in control" });
  await expect(automatedHeading.or(manualHeading)).toBeVisible();

  let restoreAutomation = false;
  if (await automatedHeading.isVisible()) {
    await expect(page.getByLabel("Staff reply")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Take over conversation" })).toBeVisible();
    test.skip(!mutationsEnabled(), "Set RESERVATION_BROWSER_MUTATIONS=true to exercise takeover state changes.");
    await page.getByRole("button", { name: "Take over conversation" }).click();
    await expect(page.getByRole("heading", { name: "You are in control" })).toBeVisible();
    restoreAutomation = true;
  }
  await expect(page.getByLabel("Staff reply")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Send as staff" })).toBeEnabled();
  if (restoreAutomation) {
    await page.getByRole("button", { name: "Resume AI automation" }).click();
    await expect(page.getByRole("heading", { name: "Automation is active" })).toBeVisible();
  }
});

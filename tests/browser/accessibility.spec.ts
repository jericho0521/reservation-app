import { AxeBuilder } from "@axe-core/playwright";
import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";
import {
  hasConsoleAuthentication,
  localBrowserFixtureAvailable,
  localBrowserManagementToken,
  openAuthenticatedConsole,
} from "./support/release-fixture";

const consoleOrigin = originFromEnv(
  "RESERVATION_BROWSER_CONSOLE_ORIGIN",
  "http://127.0.0.1:4300",
);
const bookingOrigin = originFromEnv(
  "RESERVATION_BROWSER_BOOKING_ORIGIN",
  "http://127.0.0.1:4400",
);
const bookingSlug = process.env.RESERVATION_BROWSER_BOOKING_SLUG?.trim()
  || "apex-racing-demo";
const managementToken = process.env.RESERVATION_BROWSER_MANAGEMENT_TOKEN?.trim()
  || (localBrowserFixtureAvailable ? localBrowserManagementToken : undefined);

test.describe("console accessibility", () => {
  let consoleAvailable = false;

  test.beforeAll(async ({ request }) => {
    consoleAvailable = await originIsAvailable(request, consoleOrigin);
  });

  test("login", async ({ page }) => {
    test.skip(!consoleAvailable, `Console origin unavailable: ${consoleOrigin}`);
    await openRoute(page, `${consoleOrigin}/admin/login`);
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    await expectAccessiblePage(page);
    await expectKeyboardReachable(page, page.getByRole("button", { name: "Sign in" }));
  });

  test("setup", async ({ page }) => {
    test.skip(!consoleAvailable, `Console origin unavailable: ${consoleOrigin}`);
    await openRoute(page, `${consoleOrigin}/admin/setup?token=${"a".repeat(43)}`);
    await expect(page.getByRole("heading", { level: 1, name: "Infrastructure is ready" })).toBeVisible();
    await expectAccessiblePage(page);
    await expectKeyboardReachable(page, page.getByRole("button", { name: "Create owner account" }));
  });

  test("overview", async ({ page }) => {
    test.skip(!consoleAvailable, `Console origin unavailable: ${consoleOrigin}`);
    test.skip(!hasConsoleAuthentication(), "Owner credentials or a storage state are required for the protected journey.");
    await openAuthenticatedConsole(page, "/admin");
    await expect(page.getByText("Operations command center", { exact: true })).toBeVisible();
    await expectAccessiblePage(page);
    await expectKeyboardReachable(page, page.getByRole("link", { name: "Open Studio" }));
  });

  test("inbox", async ({ page }) => {
    test.skip(!consoleAvailable, `Console origin unavailable: ${consoleOrigin}`);
    test.skip(!hasConsoleAuthentication(), "Owner credentials or a storage state are required for the protected journey.");
    await openAuthenticatedConsole(page, "/admin/conversations");
    await expect(page.getByRole("heading", { level: 1, name: "Every customer conversation" })).toBeVisible();
    await expectAccessiblePage(page);
    await expectKeyboardReachable(page, page.getByRole("button", { name: "Apply" }));
  });

  test("system status", async ({ page }) => {
    test.skip(!consoleAvailable, `Console origin unavailable: ${consoleOrigin}`);
    test.skip(!hasConsoleAuthentication(), "Owner credentials or a storage state are required for the protected journey.");
    await openAuthenticatedConsole(page, "/admin/system");
    await expect(page.getByRole("heading", { level: 1, name: "System status" })).toBeVisible();
    await expectAccessiblePage(page);
    await expectKeyboardReachable(page, page.getByRole("link", { name: "System status" }));
  });
});

test.describe("public booking accessibility", () => {
  let bookingAvailable = false;

  test.beforeAll(async ({ request }) => {
    bookingAvailable = await originIsAvailable(request, bookingOrigin);
  });

  test("booking", async ({ page }) => {
    test.skip(!bookingAvailable, `Booking origin unavailable: ${bookingOrigin}`);
    await openRoute(page, `${bookingOrigin}/${encodeURIComponent(bookingSlug)}/book`);
    await expect(page.getByRole("heading", { level: 1, name: /^Book /u })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Choose an experience" })).toBeVisible();
    await expectAccessiblePage(page);
    await expectKeyboardReachable(page, page.locator(".rp-service-card").first());
  });

  test("management", async ({ page }) => {
    test.skip(!bookingAvailable, `Booking origin unavailable: ${bookingOrigin}`);
    test.skip(!managementToken, "A current reservation management token is required for the management journey.");
    await openRoute(
      page,
      `${bookingOrigin}/${encodeURIComponent(bookingSlug)}/manage/${encodeURIComponent(managementToken!)}`,
    );
    await expect(page.getByRole("heading", { level: 1, name: /^(Your reservation|Reservation cancelled)$/u })).toBeVisible();
    await expectAccessiblePage(page);
    const cancel = page.getByRole("button", { name: "Cancel reservation" });
    const primaryAction = await cancel.isVisible()
      ? cancel
      : page.getByRole("link", { name: /Back to experience/u });
    await expectKeyboardReachable(page, primaryAction);
  });
});

async function expectAccessiblePage(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(blocking, formatViolations(blocking)).toEqual([]);
}

async function expectKeyboardReachable(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  await expect(target).toBeEnabled();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  const focusableCount = await page.locator([
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",")).count();
  const attempts = Math.min(Math.max(focusableCount + 2, 10), 120);

  for (let index = 0; index < attempts; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => document.activeElement === element)) return;
  }

  expect(false, `Primary action was not reachable after ${attempts} Tab presses.`).toBe(true);
}

async function openRoute(page: Page, url: string): Promise<void> {
  const response = await page.goto(url, { waitUntil: "domcontentloaded" });
  expect(response, `Navigation did not produce a response for ${url}.`).not.toBeNull();
}

async function originIsAvailable(
  request: APIRequestContext,
  origin: string,
): Promise<boolean> {
  try {
    await request.get(origin, { failOnStatusCode: false, timeout: 3_000 });
    return true;
  } catch {
    return false;
  }
}

function originFromEnv(name: string, fallback: string): string {
  const raw = process.env[name]?.trim() || fallback;
  const parsed = new URL(raw);
  return parsed.origin;
}

function formatViolations(
  violations: Array<{ id: string; impact?: string | null; nodes: Array<{ target: unknown }> }>,
): string {
  if (violations.length === 0) return "No serious or critical accessibility violations.";
  return violations.map((violation) => {
    const targets = violation.nodes.map((node) => JSON.stringify(node.target)).join(", ");
    return `${violation.impact ?? "unknown"}: ${violation.id} (${targets})`;
  }).join("\n");
}

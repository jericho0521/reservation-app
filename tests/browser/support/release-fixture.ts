import type { APIRequestContext, Page } from "@playwright/test";

export const consoleOrigin = process.env.RESERVATION_BROWSER_CONSOLE_URL?.trim() || "http://127.0.0.1:4300";
export const bookingOrigin = process.env.RESERVATION_BROWSER_BOOKING_URL?.trim() || "http://127.0.0.1:4400";
export const localBrowserFixtureAvailable = process.env.RESERVATION_BROWSER_USE_LOCAL_DEMO_FIXTURE === "true"
  && process.env.RESERVATION_BROWSER_DISABLE_LOCAL_FIXTURE !== "true"
  && isLoopbackOrigin(consoleOrigin)
  && isLoopbackOrigin(bookingOrigin);
export const localBrowserPublicSlug = "apex-racing-demo";
export const localBrowserConversationId = "00000000-0000-4000-8000-000000000602";
export const localBrowserManagementToken = "browser-fixture-management-token-0000000001";
const localBrowserSessionToken = "browser-fixture-session-token-0000000000001";

export async function originAvailable(request: APIRequestContext, origin: string) {
  try {
    const response = await request.get(origin, { timeout: 2_000 });
    return response.status() < 500;
  } catch {
    return false;
  }
}

export function hasConsoleAuthentication() {
  return Boolean(
    process.env.RESERVATION_BROWSER_STORAGE_STATE?.trim()
      || browserSessionToken()
      || (process.env.RESERVATION_BROWSER_OWNER_EMAIL?.trim() && process.env.RESERVATION_BROWSER_OWNER_PASSWORD),
  );
}

export async function openAuthenticatedConsole(page: Page, path: string) {
  const sessionToken = browserSessionToken();
  if (!process.env.RESERVATION_BROWSER_STORAGE_STATE?.trim() && sessionToken) {
    await page.context().addCookies([
      { name: "reservation_session", value: sessionToken, url: consoleOrigin, sameSite: "Lax" },
      { name: "reservation_active_venue", value: "00000000-0000-4000-8000-000000000101", url: consoleOrigin, sameSite: "Lax" },
    ]);
  } else if (!process.env.RESERVATION_BROWSER_STORAGE_STATE?.trim()) {
    await page.goto(`${consoleOrigin}/admin/login`);
    await page.getByLabel("Email address").fill(process.env.RESERVATION_BROWSER_OWNER_EMAIL ?? "");
    await page.getByLabel("Password").fill(process.env.RESERVATION_BROWSER_OWNER_PASSWORD ?? "");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/admin(?:\/|$)/u);
  }
  await page.goto(`${consoleOrigin}${path}`);
}

export function mutationsEnabled() {
  return process.env.RESERVATION_BROWSER_MUTATIONS === "true";
}

function browserSessionToken() {
  return process.env.RESERVATION_BROWSER_SESSION_TOKEN?.trim()
    || (localBrowserFixtureAvailable ? localBrowserSessionToken : undefined);
}

function isLoopbackOrigin(origin: string) {
  const hostname = new URL(origin).hostname;
  return hostname === "127.0.0.1" || hostname === "localhost";
}

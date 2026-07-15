import type { APIRequestContext, Page } from "@playwright/test";

export const consoleOrigin = process.env.RESERVATION_BROWSER_CONSOLE_URL?.trim() || "http://127.0.0.1:4300";
export const bookingOrigin = process.env.RESERVATION_BROWSER_BOOKING_URL?.trim() || "http://127.0.0.1:4400";

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
      || (process.env.RESERVATION_BROWSER_OWNER_EMAIL?.trim() && process.env.RESERVATION_BROWSER_OWNER_PASSWORD),
  );
}

export async function openAuthenticatedConsole(page: Page, path: string) {
  if (!process.env.RESERVATION_BROWSER_STORAGE_STATE?.trim()) {
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

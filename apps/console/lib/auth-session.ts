const sessionCookieName = "reservation_session";
const csrfCookieName = "reservation_csrf";
export const activeVenueCookieName = "reservation_active_venue";
export const publicRouteHeader = "x-reservation-console-public-route";
export const locationRouteHeader = "x-reservation-console-location-route";
export const onboardingRouteHeader = "x-reservation-console-onboarding-route";
const publicAdminPaths = new Set(["/login", "/setup"]);
const publicAdminPrefixes = ["/invite/", "/reset-password/"] as const;
const locationAdminPath = "/location";
const onboardingAdminPath = "/onboarding";
const setupWizardPrefix = "/setup/";
const safeCookieValuePattern = /^[A-Za-z0-9_-]+$/u;
const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface AuthRedirectInput {
  pathname: string;
  hasSessionCookie: boolean;
}

export function authRedirect(input: AuthRedirectInput): string | undefined {
  if (isPublicAdminPath(input.pathname) || input.hasSessionCookie) return undefined;
  return "/admin/login";
}

export function isPublicAdminPath(pathname: string): boolean {
  return publicAdminPaths.has(pathname)
    || pathname === "/reset-password"
    || publicAdminPrefixes.some((prefix) => pathname.startsWith(prefix));
}

export function buildMiddlewareRequestHeaders(pathname: string, incoming: Headers): Headers {
  const headers = new Headers(incoming);
  headers.delete(publicRouteHeader);
  headers.delete(locationRouteHeader);
  headers.delete(onboardingRouteHeader);
  if (isPublicAdminPath(pathname)) headers.set(publicRouteHeader, "1");
  if (pathname === locationAdminPath) headers.set(locationRouteHeader, "1");
  if (pathname === onboardingAdminPath || pathname.startsWith(setupWizardPrefix)) {
    headers.set(onboardingRouteHeader, "1");
  }
  return headers;
}

export function buildSessionForwardHeaders(
  cookieHeader: string,
): Record<string, string> {
  const cookies = parseCookies(cookieHeader);
  const session = singleCookie(cookies, sessionCookieName);
  const csrf = singleCookie(cookies, csrfCookieName);
  const headers: Record<string, string> = {};

  if (session) {
    headers.cookie = [
      `${sessionCookieName}=${session}`,
      ...(csrf ? [`${csrfCookieName}=${csrf}`] : []),
    ].join("; ");
  }
  if (csrf) headers["X-CSRF-Token"] = csrf;

  return headers;
}

export function buildPlatformForwardHeaders(
  cookieHeader: string,
  options: { includeActiveVenue?: boolean } = {},
): Record<string, string> {
  const headers = buildSessionForwardHeaders(cookieHeader);
  if (options.includeActiveVenue !== false) {
    const activeVenue = singleCookie(parseCookies(cookieHeader), activeVenueCookieName);
    if (activeVenue) headers["X-Reservation-Venue-Id"] = activeVenue;
  }
  return headers;
}

export function activeVenueFromCookieHeader(cookieHeader: string): string | undefined {
  return singleCookie(parseCookies(cookieHeader), activeVenueCookieName);
}

export type ActiveLocationState =
  | { kind: "onboarding" }
  | { kind: "selection_required"; venueIds: readonly string[] }
  | { kind: "ready"; venueId: string; canChange: boolean };

export function resolveActiveLocation(
  assignedVenueIds: readonly string[],
  selectedVenueId?: string,
): ActiveLocationState {
  const venueIds = [...new Set(assignedVenueIds)];
  if (venueIds.length === 0) return { kind: "onboarding" };
  if (selectedVenueId) {
    return venueIds.includes(selectedVenueId)
      ? { kind: "ready", venueId: selectedVenueId, canChange: venueIds.length > 1 }
      : { kind: "selection_required", venueIds };
  }
  return venueIds.length === 1
    ? { kind: "ready", venueId: venueIds[0], canChange: false }
    : { kind: "selection_required", venueIds };
}

export function validateActiveVenueSelection(
  assignedVenueIds: readonly string[],
  selectedVenueId: string,
): string | undefined {
  return assignedVenueIds.includes(selectedVenueId) ? selectedVenueId : undefined;
}

export function buildInternalApiFetchInit(
  init: RequestInit | undefined,
  incomingHeaders: Headers,
): RequestInit {
  const headers = new Headers(init?.headers);
  headers.delete("Origin");
  const method = (init?.method ?? "GET").toUpperCase();
  const origin = writeMethods.has(method) ? validatedSameOrigin(incomingHeaders) : undefined;
  if (origin) headers.set("Origin", origin);
  return { ...init, headers };
}

function parseCookies(cookieHeader: string): Map<string, string[]> {
  const cookies = new Map<string, string[]>();
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 1) continue;
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (!safeCookieValuePattern.test(value)) continue;
    cookies.set(name, [...(cookies.get(name) ?? []), value]);
  }
  return cookies;
}

function singleCookie(cookies: Map<string, string[]>, name: string): string | undefined {
  const values = cookies.get(name);
  return values?.length === 1 ? values[0] : undefined;
}

function validatedSameOrigin(headers: Headers): string | undefined {
  const rawOrigin = headers.get("origin")?.trim();
  const host = firstForwardedValue(headers.get("x-forwarded-host"))
    ?? headers.get("host")?.trim().toLowerCase();
  if (!rawOrigin || !host) return undefined;

  try {
    const origin = new URL(rawOrigin);
    if ((origin.protocol !== "https:" && origin.protocol !== "http:")
      || origin.username || origin.password
      || origin.pathname !== "/" || origin.search || origin.hash
      || origin.host !== host
      || origin.origin !== rawOrigin) {
      return undefined;
    }
    const forwardedProtocol = firstForwardedValue(headers.get("x-forwarded-proto"));
    if (forwardedProtocol && `${forwardedProtocol}:` !== origin.protocol) return undefined;
    return rawOrigin;
  } catch {
    return undefined;
  }
}

function firstForwardedValue(value: string | null): string | undefined {
  const first = value?.split(",", 1)[0]?.trim().toLowerCase();
  return first || undefined;
}

const sessionCookieName = "reservation_session";
const csrfCookieName = "reservation_csrf";
const publicAdminPaths = new Set(["/admin/login", "/admin/setup"]);
const safeCookieValuePattern = /^[A-Za-z0-9_-]+$/u;

export interface AuthRedirectInput {
  pathname: string;
  hasSessionCookie: boolean;
}

export function authRedirect(input: AuthRedirectInput): string | undefined {
  if (publicAdminPaths.has(input.pathname) || input.hasSessionCookie) return undefined;
  return "/admin/login";
}

export function isPublicAdminPath(pathname: string): boolean {
  return publicAdminPaths.has(pathname);
}

export function buildSessionForwardHeaders(
  cookieHeader: string,
  origin?: string | null,
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
  if (origin) headers.Origin = origin;

  return headers;
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

export const DEFAULT_PRODUCTION_APP_URL =
  "https://reservation-app-eight-blond.vercel.app";

type AppUrlEnvironment = Record<string, string | undefined>;

function normalizeAppUrl(value: string): string {
  const url = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;

  return url.replace(/\/+$/, "");
}

export function getAppUrl(
  environment: AppUrlEnvironment = process.env,
): string {
  const configuredUrl =
    environment.NEXT_PUBLIC_APP_URL?.trim() ||
    environment.VERCEL_PROJECT_PRODUCTION_URL?.trim();

  return configuredUrl
    ? normalizeAppUrl(configuredUrl)
    : DEFAULT_PRODUCTION_APP_URL;
}

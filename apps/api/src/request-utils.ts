import { createHash, timingSafeEqual } from "node:crypto";
import type { StandaloneApiRequest } from "./http.js";

export function constantTimeEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function getHeader(headers: StandaloneApiRequest["headers"], name: string) {
  if (!headers) return undefined;
  const normalizedName = name.toLowerCase();
  for (const [headerName, value] of Object.entries(headers)) {
    if (headerName.toLowerCase() === normalizedName) return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

export function readCookie(request: StandaloneApiRequest, name: string): string | undefined {
  const header = getHeader(request.headers, "Cookie");
  if (!header) return undefined;
  let matched: string | undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    if (!value || matched !== undefined) return undefined;
    matched = value;
  }
  return matched;
}

export function parseRequestUrl(path: string) {
  return new URL(path, "http://standalone-api.local");
}

export function normalizePath(path: string) {
  const normalized = path.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isValidHttpStatus(status: number | undefined): status is number {
  return typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599;
}

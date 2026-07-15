import { createHash, timingSafeEqual } from "node:crypto";
import type { AuthenticatedPrincipal } from "@reservation-platform/api";
import type { StandaloneApiRequest, StandaloneApiResponse } from "./http.js";
import { platformError } from "./http.js";

export interface PersistentRateLimitRepository {
  consumeRateLimit(input: { bucketHash: string; routeGroup: string; limit: number; windowSeconds: number }): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }>;
}

interface LimitRule { routeGroup: string; limit: number; windowSeconds: number; bucketParts: readonly string[] }

export async function applyRateLimit(
  request: StandaloneApiRequest,
  repository: PersistentRateLimitRepository | undefined,
  options: { serviceApiKey?: string } = {},
): Promise<StandaloneApiResponse | undefined> {
  if (!repository || request.internalPreflight || trustedServiceRequest(request, options.serviceApiKey)) return undefined;
  const url = new URL(request.path, "http://reservation-api.local");
  const rule = ruleForRequest(request.method.toUpperCase(), url.pathname, request);
  if (!rule) return undefined;
  let decision;
  try {
    decision = await repository.consumeRateLimit({
      bucketHash: createHash("sha256").update(rule.bucketParts.join("\u0000")).digest("hex"),
      routeGroup: rule.routeGroup,
      limit: rule.limit,
      windowSeconds: rule.windowSeconds,
    });
  } catch {
    return platformError(503, "storage_unavailable", "Request protection is temporarily unavailable.");
  }
  if (decision.allowed) return undefined;
  const response = platformError(429, "rate_limited", "Too many requests. Try again later.");
  return { ...response, headers: { ...response.headers, "retry-after": String(Math.max(1, decision.retryAfterSeconds)), "x-ratelimit-remaining": String(decision.remaining), "cache-control": "no-store" } };
}

export function isWhatsAppPairingRateLimitPath(method: string, path: string) {
  return method.toUpperCase() === "POST" && /^\/v1\/channels\/whatsapp\/session\/(?:start|reconnect)$/u.test(path);
}

function ruleForRequest(method: string, path: string, request: StandaloneApiRequest): LimitRule | undefined {
  const ip = requestIp(request);
  if (method === "POST" && path === "/v1/auth/login") return rule("login", 10, 900, ip, normalizedEmail(request.body));
  if (method === "POST" && path === "/v1/setup/owner") return rule("setup", 5, 900, ip);
  if (method === "POST" && path === "/v1/auth/password-reset") return rule("password_reset", 5, 3600, ip, normalizedEmail(request.body));
  if (isWhatsAppPairingRateLimitPath(method, path)) {
    const principal = request.authenticatedPrincipal;
    return principal ? rule("whatsapp_pairing", 5, 600, principal.tenantId, principal.userId) : undefined;
  }
  if (/^\/v1\/public\/experiences\/[^/]+\/chat\//u.test(path)) {
    const conversation = /^\/v1\/public\/experiences\/[^/]+\/chat\/conversations\/([^/]+)/u.exec(path)?.[1] ?? bodyString(request.body, "conversation_id") ?? "new";
    return rule("public_chat", 20, 60, ip, conversation);
  }
  if (method !== "GET" && /^\/v1\/public\/experiences\/[^/]+\/(?:reservations|manage\/)/u.test(path)) return rule("public_booking", 30, 60, ip);
  return undefined;
}

function rule(routeGroup: string, limit: number, windowSeconds: number, ...parts: string[]): LimitRule { return { routeGroup, limit, windowSeconds, bucketParts: parts }; }
function requestIp(request: StandaloneApiRequest) { const value = request.clientIp?.trim() || header(request, "x-forwarded-for")?.split(",")[0]?.trim() || header(request, "x-real-ip")?.trim(); return value || "unknown"; }
function normalizedEmail(body: unknown) { return bodyString(body, "email")?.trim().toLowerCase() || "unknown"; }
function bodyString(body: unknown, key: string) { return body && typeof body === "object" && !Array.isArray(body) && typeof (body as Record<string, unknown>)[key] === "string" ? (body as Record<string, string>)[key] : undefined; }
function header(request: StandaloneApiRequest, name: string) { const pair = Object.entries(request.headers ?? {}).find(([key]) => key.toLowerCase() === name); const value = pair?.[1]; return Array.isArray(value) ? value[0] : value; }
function trustedServiceRequest(request: StandaloneApiRequest, serviceApiKey: string | undefined) {
  if (!serviceApiKey) return false;
  const authorization = header(request, "authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (!token || token.length !== serviceApiKey.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(serviceApiKey));
}

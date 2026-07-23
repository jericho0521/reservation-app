import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const platformBaseUrl = process.env.RESERVATION_PLATFORM_BASE_URL?.trim().replace(/\/+$/u, "")
  || "http://reservation-api:4100";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: "/admin",
  async rewrites() {
    return {
      beforeFiles: [{
        source: "/v1/:path*",
        destination: `${platformBaseUrl}/v1/:path*`,
        basePath: false,
      }],
    };
  },
  async headers() {
    const privateHeaders = [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "private, no-store" },
    ];
    return [
      ...["/setup", "/invite/:path*", "/reset-password", "/reset-password/:path*"].map((source) => ({
      source,
      headers: privateHeaders,
      })),
      { source: "/channels", headers: privateHeaders },
      { source: "/api/availability", headers: [...privateHeaders, { key: "Vary", value: "Cookie" }] },
      { source: "/api/whatsapp/qr", headers: [...privateHeaders, { key: "Vary", value: "Cookie" }] },
    ];
  },
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@reservation-platform/sdk"],
  turbopack: { root: repoRoot },
};

export default nextConfig;

import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: "/admin",
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
      { source: "/api/whatsapp/qr", headers: [...privateHeaders, { key: "Vary", value: "Cookie" }] },
    ];
  },
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@reservation-platform/sdk"],
  turbopack: { root: repoRoot },
};

export default nextConfig;

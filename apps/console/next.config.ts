import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@reservation-platform/sdk"],
  turbopack: { root: repoRoot },
};

export default nextConfig;

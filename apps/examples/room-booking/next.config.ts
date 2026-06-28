import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@reservation-platform/react", "@reservation-platform/ui"],
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;

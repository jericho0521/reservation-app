import type { NextConfig } from "next";
import { contentImagePatterns } from "./lib/content-images";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  images: { remotePatterns: contentImagePatterns() },
  turbopack: {
    root: appRoot,
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;

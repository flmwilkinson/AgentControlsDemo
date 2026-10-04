import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this repo (a stray lockfile higher up must not widen it).
  turbopack: { root: import.meta.dirname },
  devIndicators: false,
  agentRules: false,
};

export default nextConfig;

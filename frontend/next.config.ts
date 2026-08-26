import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev-tools badge overlaps the sidebar footer; hide it.
  devIndicators: false,
  // /api, /auth and /health are proxied by route handlers (see lib/proxy.ts),
  // not by rewrites: the dev server's rewrite proxy throws an unhandled error
  // when the backend connection drops, which crashes the whole dev server.
};

export default nextConfig;

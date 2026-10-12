import type { NextConfig } from "next";

// Almost bare. The app is one Next.js application holding both doors — the web view and
// the MCP route handler — over one core module (ADR-0001), and neither door needs a
// build-time option to exist.
//
// The one option is about how it ships. `standalone` makes `next build` trace what the
// server actually imports and write a self-contained server into `.next/standalone`, which
// is what lets the container be node plus that directory instead of node plus the whole
// `node_modules`. The `Dockerfile` beside this file is the other half of it.
const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;

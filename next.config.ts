import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for minimal Docker production image
  output: "standalone",

  // Allow DB and Playwright validation modules to run natively on the server
  serverExternalPackages: ["pg", "playwright", "playwright-core", "pngjs"],
};

export default nextConfig;

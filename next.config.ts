import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for minimal Docker production image
  output: "standalone",

  // Allow the DB client to be imported in server components
  serverExternalPackages: ["pg"],
};

export default nextConfig;

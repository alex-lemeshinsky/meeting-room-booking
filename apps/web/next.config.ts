import type { NextConfig } from "next";

const apiOrigin = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

const config: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`
      }
    ];
  }
};

export default config;

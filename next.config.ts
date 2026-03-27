import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "*.jpe1.devtunnels.ms",
    "10.0.1.2",
    "100.99.148.98",
  ],
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: "http://localhost:3000/api/v1/:path*",
      },
    ];
  },
};

export default nextConfig;


import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/marketing", destination: "/marketing/orbit", permanent: false },
    ];
  },
};

export default nextConfig;

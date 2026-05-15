import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Root → orbit. The legacy SPA at src/app/page.tsx is unreachable
      // by design; the entire app now lives under structured /marketing/*,
      // /3d, /usage, /social routes with consistent navigation.
      { source: "/", destination: "/marketing/orbit", permanent: false },
      { source: "/marketing", destination: "/marketing/orbit", permanent: false },
    ];
  },
};

export default nextConfig;

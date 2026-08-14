import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Signed URLs from Supabase Storage (hosted + local CLI).
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "http", hostname: "127.0.0.1" },
      { protocol: "http", hostname: "localhost" },
    ],
    // Local sample images in public/marketing are SVGs.
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;

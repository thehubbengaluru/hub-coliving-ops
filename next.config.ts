import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // The proxy (src/proxy.ts) makes Next buffer request bodies, capped at
    // 10MB by default — beyond that the body is silently truncated and
    // req.formData() throws. Booking submissions carry several photos/ID
    // scans, so allow comfortably more.
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;

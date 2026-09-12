import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next dev's HMR bootstrap must accept this demo tunnel's browser origin.
  allowedDevOrigins: ["circus-thicken-plod.ngrok-free.dev"],
};

export default nextConfig;

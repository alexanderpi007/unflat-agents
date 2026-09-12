import { defineConfig } from "@playwright/test";

// Read-only check against the actual running dev tunnel, not a localhost proxy fixture.
export default defineConfig({
  testDir: "./tests",
  testMatch: "owner-tunnel.e2e.ts",
  workers: 1,
  use: {
    baseURL: process.env.UNFLAT_TUNNEL_URL ?? "https://circus-thicken-plod.ngrok-free.dev",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    extraHTTPHeaders: { "ngrok-skip-browser-warning": "true" },
  },
});

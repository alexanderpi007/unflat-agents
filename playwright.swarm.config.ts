import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "swarm.e2e.ts",
  workers: 1,
  use: { baseURL: "http://localhost:3107", headless: true },
  webServer: {
    command: "npm run start -- --port 3107",
    env: { MOCK_MODE: "true" },
    url: "http://localhost:3107",
    reuseExistingServer: false,
  },
});

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/pwa",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4173/OpenSketch/",
    viewport: { width: 1440, height: 960 },
    serviceWorkers: "allow",
    trace: "on-first-retry"
  },
  webServer: {
    command: "pnpm preview --host 127.0.0.1",
    url: "http://127.0.0.1:4173/OpenSketch/",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});

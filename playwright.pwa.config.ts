import { defineConfig, devices } from "@playwright/test";
import { normalizePublicBase } from "./apps/web/src/deploymentBase";

const publicBase = normalizePublicBase(process.env.VITE_PUBLIC_BASE);
const previewBaseUrl = `http://127.0.0.1:4173${publicBase}`;

export default defineConfig({
  testDir: "./tests/pwa",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: previewBaseUrl,
    viewport: { width: 1440, height: 960 },
    serviceWorkers: "allow",
    trace: "on-first-retry"
  },
  webServer: {
    command: "pnpm preview --host 127.0.0.1",
    url: previewBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});

import { defineConfig, devices } from "@playwright/test";

// Use Vercel preview URL in CI, otherwise localhost
const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:4321";
const useVercelPreview = !!process.env.PLAYWRIGHT_TEST_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Only start local dev server if not testing against Vercel preview
  webServer: useVercelPreview ? undefined : {
    command: "bun run dev",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
  },
});

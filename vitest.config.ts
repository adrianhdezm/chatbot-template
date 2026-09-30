import { defineConfig } from "vitest/config"

// End-to-end tests: the global setup builds the app and serves it in mock
// mode (no OPENAI_API_KEY), then the tests drive it with Playwright.
export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    globalSetup: ["tests/e2e/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // Show the browser locally; run headless in CI.
    provide: { headless: Boolean(process.env.CI) },
  },
})

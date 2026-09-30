import { defineConfig } from "vitest/config"

// End-to-end tests: the global setup builds the app and serves it in mock
// mode (no OPENAI_API_KEY), then the tests drive it with Playwright.
export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    globalSetup: ["tests/e2e/e2e-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // Headless by default; set E2E_HEADED=1 to watch the browser.
    provide: { headless: !process.env.E2E_HEADED },
  },
})

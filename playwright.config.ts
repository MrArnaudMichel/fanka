import { defineConfig, devices } from '@playwright/test';

// The Playwright MCP browser download is blocked in this environment; the
// installed @playwright/test version (1.63.0) was chosen to match the
// Chromium revision already cached at ~/.cache/ms-playwright/chromium-1243
// (browsers.json confirms revision 1243 for both), so `npx playwright
// install chromium` resolves from cache instead of downloading. On a
// different machine or CI runner without that cache, the same `npx
// playwright install chromium` step downloads the matching revision instead.
export default defineConfig({
  testDir: 'e2e',
  // Serialised, not parallel: the first test reaches /review through the
  // Today page's Start-session button, which warms Nuxt's dev-mode compile
  // of that route. One worker guarantees that happens before the second
  // test's direct `goto('/review')` — a longer `expect` timeout would only
  // narrow the race between two workers each cold-compiling the same route
  // at once, not remove it, and this suite is small enough that running it
  // in one worker costs a couple of seconds, not minutes.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://localhost:3000', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

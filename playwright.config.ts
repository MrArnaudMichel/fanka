import { defineConfig, devices } from '@playwright/test';

// The Playwright MCP browser download is blocked in this environment; the
// installed @playwright/test version (1.63.0) was chosen to match the
// Chromium revision already cached at ~/.cache/ms-playwright/chromium-1243
// (browsers.json confirms revision 1243 for both), so `npx playwright
// install chromium` resolves from cache instead of downloading.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
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

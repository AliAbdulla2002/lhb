import { defineConfig, devices } from "@playwright/test";
import { STUB_SUPABASE_URL } from "./e2e/fixtures/supabase-stub";

const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: [["list"]],
  // Four parallel browsers on a dev machine can be slow; allow more than the 5 s default.
  expect: { timeout: 10_000 },
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Production build served statically, pointed at the stubbed Supabase host.
    command: `npx react-router build && npx vite preview --outDir build/client --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: STUB_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: "stub-anon-key-for-ui-smoke-tests-only",
      VITE_SITE_URL: `http://127.0.0.1:${PORT}`,
    },
  },
});

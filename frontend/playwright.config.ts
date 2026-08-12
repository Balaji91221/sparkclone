import { defineConfig } from "@playwright/test";

// E2E suite for Astra. Requires both dev servers running:
//   backend  http://localhost:8010  (uvicorn with .env loaded)
//   frontend http://localhost:3000  (next dev)
// Tests seed data through the real API and clean up after themselves;
// everything they create is prefixed "E2E-PW".
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    viewport: { width: 1380, height: 900 },
  },
});

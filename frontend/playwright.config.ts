import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const testDatabase = path.resolve(
  "../backend/data",
  `e2e-${Date.now()}.sqlite3`,
);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1050 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: `"${path.resolve("../.venv/Scripts/python.exe")}" -m uvicorn app.main:app --app-dir ../backend --host 127.0.0.1 --port 8000`,
      url: "http://127.0.0.1:8000/api/personalities",
      reuseExistingServer: false,
      env: {
        DATABASE_PATH: testDatabase,
        OLLAMA_MODEL: process.env.E2E_MODEL || "qwen3:8b",
      },
      timeout: 30000,
    },
    {
      command: "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1",
      url: "http://127.0.0.1:3000",
      reuseExistingServer: false,
      env: { NEXT_TELEMETRY_DISABLED: "1" },
      timeout: 60000,
    },
  ],
});

import { defineConfig } from "@playwright/test";
import access from "./playwright.access.config";

// Narrow, explicit authorization for one identified synthetic employee, not general sales E2E.
if (process.env.MAMITA_SCOPED_EMPLOYEE_TEST !== "MM-TEST-20261029-P05") throw new Error("Scoped employee test requires explicit run authorization.");
export default defineConfig({
  ...access,
  testMatch: "shared-migrations.spec.ts",
  timeout: 90_000,
  outputDir: "./test-results/shared-migrations",
  webServer: { command: "pnpm start --hostname 127.0.0.1 --port 3101", url: "http://127.0.0.1:3101/login", env: { MAMITA_QA_BUILD: "true" }, reuseExistingServer: false, timeout: 60_000 },
});

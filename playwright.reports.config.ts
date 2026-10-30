import { defineConfig } from "@playwright/test";
import access from "./playwright.access.config";
export default defineConfig({
  ...access, testMatch: "reports.spec.ts", timeout: 60_000, expect: { timeout: 15_000 }, outputDir: "./test-results/reports",
  webServer: { command: "pnpm start --hostname 127.0.0.1 --port 3101", url: "http://127.0.0.1:3101/login", env: { MAMITA_QA_BUILD: "true", TZ: "UTC" }, reuseExistingServer: false, timeout: 60_000 },
});

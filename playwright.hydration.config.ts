import { defineConfig } from "@playwright/test";
import access from "./playwright.access.config";

export default defineConfig({
  ...access,
  testMatch: "hydration.spec.ts",
  outputDir: "./test-results/hydration",
  webServer: { command: "pnpm start --hostname 127.0.0.1 --port 3101", url: "http://127.0.0.1:3101/login", env: { MAMITA_QA_BUILD: "true", TZ: "UTC" }, reuseExistingServer: false, timeout: 60_000 },
});

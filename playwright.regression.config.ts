import { defineConfig } from "@playwright/test";
import access from "./playwright.access.config";
export default defineConfig({
  ...access,
  testMatch: ["access-readonly.spec.ts", "menu-search.spec.ts", "modules.spec.ts", "hydration.spec.ts", "promotions.spec.ts", "employee-purchases.spec.ts", "profile.spec.ts"],
  timeout: 60_000,
  outputDir: "./test-results/regression",
  webServer: { command: "pnpm start --hostname 127.0.0.1 --port 3101", url: "http://127.0.0.1:3101/login", env: { MAMITA_QA_BUILD: "true", TZ: "UTC" }, reuseExistingServer: false, timeout: 60_000 },
});

import { defineConfig } from "@playwright/test";
import access from "./playwright.access.config";

export default defineConfig({
  ...access,
  testMatch: ["menu-search.spec.ts", "access-readonly.spec.ts"],
  outputDir: "./test-results/p02",
  webServer: {
    command: "pnpm start --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101/login",
    env: { MAMITA_QA_BUILD: "true" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

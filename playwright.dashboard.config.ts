import { defineConfig } from "@playwright/test";
import reports from "./playwright.reports.config";
export default defineConfig({ ...reports, testMatch: ["dashboard.spec.ts", "reports.spec.ts"], outputDir: "./test-results/dashboard" });

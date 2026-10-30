import { defineConfig } from "@playwright/test";
import dashboard from "./playwright.dashboard.config";
export default defineConfig({ ...dashboard, testMatch: ["dashboard.spec.ts", "reports.spec.ts", "excel-export.spec.ts"], outputDir: "./test-results/excel" });

import { defineConfig } from "@playwright/test";
import regression from "./playwright.regression.config";
export default defineConfig({...regression,testMatch:"compact.spec.ts",outputDir:"./test-results/compact"});

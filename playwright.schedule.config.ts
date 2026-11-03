import {defineConfig} from "@playwright/test";
import regression from "./playwright.regression.config";
export default defineConfig({...regression,testMatch:["cash-schedule.spec.ts","payment-observations.spec.ts"],outputDir:"./test-results/cash-schedule-run"});

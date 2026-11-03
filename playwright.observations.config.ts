import {defineConfig} from "@playwright/test";
import regression from "./playwright.regression.config";
export default defineConfig({...regression,testMatch:"payment-observations.spec.ts",outputDir:"./test-results/payment-observations-run"});

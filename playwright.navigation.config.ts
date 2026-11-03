import {defineConfig} from "@playwright/test";
import regression from "./playwright.regression.config";
export default defineConfig({...regression,testMatch:"navigation-recovery.spec.ts",outputDir:"./test-results/navigation-recovery-run"});

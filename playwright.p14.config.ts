import { defineConfig } from "@playwright/test";
import regression from "./playwright.regression.config";
export default defineConfig({...regression,testMatch:["performance.spec.ts","access-readonly.spec.ts","hydration.spec.ts","order-board.spec.ts","reports.spec.ts","excel-export.spec.ts"],outputDir:"./test-results/p14",timeout:60000});

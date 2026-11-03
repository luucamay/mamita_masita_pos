import {defineConfig} from "@playwright/test";
import regression from "./playwright.regression.config";
export default defineConfig({
 ...regression,
 testMatch:["employee-history.spec.ts"],
 outputDir:"./test-results/employee-history",
 use:{...regression.use,baseURL:"http://127.0.0.1:3103"},
 webServer:{...regression.webServer as object,command:"pnpm start --hostname 127.0.0.1 --port 3103",url:"http://127.0.0.1:3103/login"},
});

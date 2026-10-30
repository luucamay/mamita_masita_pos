import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import access from "./playwright.access.config";
// Dedicated recorded UUID fixture only; the general shared-sales runner stays disabled.
const fixture=JSON.parse(readFileSync(resolve("../SUPABASE/RESPALDOS_PRIVADOS/2026-10-30_p13/live-fixture.json"),"utf8"));
if(process.env.P13_RUN_RECORDED_FIXTURE!=="true"||fixture.project!=="idqgwcrczdqvacxneyui"||!fixture.prefix?.startsWith("MM-TEST-P13-")||fixture.state!=="prepared")throw Error("P13 requires the explicitly recorded QA fixture");
export default defineConfig({...access,testMatch:"p13-live.spec.ts",timeout:240000,expect:{timeout:20000},outputDir:"./test-results/p13-live",webServer:{command:"pnpm start --hostname 127.0.0.1 --port 3101",url:"http://127.0.0.1:3101/login",env:{MAMITA_QA_BUILD:"true",TZ:"UTC"},reuseExistingServer:false,timeout:60000}});

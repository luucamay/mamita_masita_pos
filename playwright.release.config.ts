import {defineConfig} from "@playwright/test";
import {existsSync} from "node:fs";
import access from "./playwright.access.config";
// Supply the local secret to the server process, as Vercel must do via its env.
// Production code intentionally never reads .env.admin.local as a fallback.
if(!process.env.SUPABASE_SECRET_KEY&&existsSync(".env.admin.local"))process.loadEnvFile(".env.admin.local");
if(!process.env.SUPABASE_SECRET_KEY)throw Error("Falta la variable administrativa del servidor de entrega.");
export default defineConfig({
 ...access,testMatch:"release-readonly.spec.ts",outputDir:"./test-results/release",timeout:60000,
 use:{...access.use,baseURL:"http://127.0.0.1:3102"},
 webServer:{command:"pnpm start --hostname 127.0.0.1 --port 3102",url:"http://127.0.0.1:3102/login",reuseExistingServer:false,timeout:60000,env:{MAMITA_RELEASE_BUILD:"true",MAMITA_QA_BUILD:"false",TZ:"UTC"}},
});

import {defineConfig} from '@playwright/test';
import {loadLocalEnvironment} from './scripts/environment.cjs';
loadLocalEnvironment();
process.loadEnvFile('.env.cash-daily-test.local');
if(!process.env.E2E_ADMIN_EMAIL?.endsWith('@mamita-masita.test')||!process.env.E2E_ADMIN_PASSWORD)throw Error('Se requieren credenciales temporales de pruebas.');
export default defineConfig({testDir:'./e2e',testMatch:'cash-daily.spec.ts',workers:1,timeout:60000,expect:{timeout:15000},reporter:'list',outputDir:'./test-results/cash-daily',use:{baseURL:'http://127.0.0.1:3103',channel:'chrome',trace:'off',screenshot:'off',video:'off'},webServer:{command:'pnpm start --hostname 127.0.0.1 --port 3103',url:'http://127.0.0.1:3103/login',env:{MAMITA_RELEASE_BUILD:'true',MAMITA_QA_BUILD:'false',TZ:'UTC'},reuseExistingServer:false,timeout:60000}});

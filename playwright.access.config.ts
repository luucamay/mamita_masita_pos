import { defineConfig } from "@playwright/test";
import { inspectEnvironment, loadLocalEnvironment } from "./scripts/environment.cjs";

// Only QA login and local page reads. No sales/RPC mutations.
loadLocalEnvironment();
const state = inspectEnvironment();
if (!state.sharedProduction || !state.publicKeyConfigured) throw new Error("Destino de pruebas de acceso desconocido.");
for (const role of ["ADMIN", "STAFF", "COOK", "BARISTA", "INACTIVE_STAFF"]) {
  if (!process.env[`E2E_${role}_EMAIL`]?.endsWith("@mamita-masita.test") || !process.env[`E2E_${role}_PASSWORD`]) throw new Error(`Faltan credenciales QA de ${role}.`);
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "access-readonly.spec.ts",
  workers: 1,
  timeout: 45_000,
  reporter: "list",
  outputDir: "./test-results/access",
  use: { baseURL: "http://127.0.0.1:3101", channel: "chrome", trace: "off", screenshot: "off", video: "off" },
  webServer: { command: "pnpm start --hostname 127.0.0.1 --port 3101", url: "http://127.0.0.1:3101/login", reuseExistingServer: false, timeout: 60_000 },
});

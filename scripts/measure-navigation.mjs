// Read-only page navigation with QA. Never sends a product/order mutation.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { inspectEnvironment, loadLocalEnvironment } from "./environment.cjs";

loadLocalEnvironment();
const label = process.argv[2] ?? "measurement";
if (!/^[a-z0-9-]+$/.test(label)) throw new Error("Etiqueta inválida");
const origin = new URL(process.argv[3] ?? "http://localhost:3000");
if (origin.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("Solo se mide localhost");
if (!inspectEnvironment().sharedProduction || !process.env.E2E_ADMIN_EMAIL?.endsWith("@mamita-masita.test")) throw new Error("Cuenta/destino QA inválidos");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, serviceWorkers: "block" });
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const routes = [
  { link: "Cocina", path: "/cocina", heading: "Cola de cocina" },
  { link: "Café", path: "/cafe", heading: "Cola de café" },
  { link: "Pedidos", path: "/pedidos", heading: "Pedidos" },
  { link: "Admin menú", path: "/menu-admin", heading: "Nuevo producto" },
];
const samples = [];
try {
  await page.goto(`${origin.origin}/login`);
  await page.getByLabel("Correo electrónico").fill(process.env.E2E_ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(process.env.E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.getByRole("link", { name: "Admin menú", exact: true }).waitFor();
  for (let round = 1; round <= 3; round++) {
    for (const route of routes) {
      const start = performance.now();
      await page.getByRole("link", { name: route.link, exact: true }).click();
      await page.waitForURL((url) => url.pathname === route.path);
      await page.getByRole("heading", { name: route.heading, exact: true }).waitFor();
      samples.push({ round, path: route.path, milliseconds: Math.round(performance.now() - start) });
    }
  }
  const summary = routes.map((route) => {
    const values = samples.filter((sample) => sample.path === route.path && sample.round > 1).map((s) => s.milliseconds).sort((a, b) => a - b);
    return { path: route.path, warmMeanMs: Math.round(values.reduce((a, b) => a + b, 0) / values.length) };
  });
  const evidence = { label, origin: origin.origin, measuredAt: new Date().toISOString(), method: "desktop Chrome, QA admin, sidebar click to page heading, 1 cold + 2 warm rounds; real network varies", samples, summary, businessMutations: 0 };
  mkdirSync(resolve("docs/desarrollo/evidencias"), { recursive: true });
  writeFileSync(resolve(`docs/desarrollo/evidencias/navigation-${label}.json`), JSON.stringify(evidence, null, 2) + "\n");
  if (label === "before") {
    mkdirSync(resolve("test-results/p02"), { recursive: true });
    await page.screenshot({ path: "test-results/p02/before-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/p02/before-mobile.png" });
  }
  console.log(JSON.stringify({ label, summary, secretValuesPrinted: false }));
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.getByRole("button", { name: "Salir", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/login");
} finally { await browser.close(); }

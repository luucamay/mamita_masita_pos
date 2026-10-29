import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, role: string, next = "/") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Correo electrónico").fill(process.env[`E2E_${role}_EMAIL`]!);
  await page.getByLabel("Contraseña").fill(process.env[`E2E_${role}_PASSWORD`]!);
  await page.getByRole("button", { name: "Ingresar" }).click();
}

test("unauthenticated pages redirect; PWA assets remain public", async ({ page, request }) => {
  await page.goto("/pedidos");
  await expect(page).toHaveURL(/\/login\?next=/);
  expect((await request.get("/manifest.webmanifest")).status()).toBe(200);
  expect((await request.get("/sw.js")).status()).toBe(200);
});

for (const { role, home } of [{ role: "STAFF", home: "/" }, { role: "COOK", home: "/cocina" }, { role: "BARISTA", home: "/cafe" }]) {
  test(`${role} cannot read administration or export routes`, async ({ page }) => {
    await login(page, role);
    await expect(page).toHaveURL(new RegExp(`${home}$`));
    for (const route of ["/menu-admin", "/historial", "/historial/export?period=daily"]) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`${home}$`));
    }
    await expect(page.getByRole("link", { name: "Admin menú", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Historial", exact: true })).toHaveCount(0);
  });
}

test("active administrator can open menu administration", async ({ page }) => {
  await login(page, "ADMIN", "/menu-admin");
  await expect(page).toHaveURL(/\/menu-admin$/);
  await expect(page.getByRole("heading", { name: "Nuevo producto", exact: true })).toBeVisible();
  expect((await page.request.get("/historial/export?period=invalid")).status()).toBe(400);
});

test("inactive account is rejected without redirect loops", async ({ page }) => {
  await login(page, "INACTIVE_STAFF");
  await expect(page.getByText("Tu cuenta no tiene acceso activo. Contacta a la administradora.")).toBeVisible();
  await expect(page).toHaveURL(/\/login\?/);
  await page.goto("/pedidos");
  await expect(page).toHaveURL(/\/login\?/);
});

test("login cannot redirect the browser to an external site", async ({ page }) => {
  await login(page, "STAFF", "https://example.invalid/");
  await expect(page).toHaveURL("http://127.0.0.1:3101/");
});

test("offline navigation cannot replay authenticated HTML from cache", async ({ page, context }) => {
  await login(page, "STAFF");
  await expect(page).toHaveURL("http://127.0.0.1:3101/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  const cachedPrivatePage = await page.evaluate(async () => {
    const keys = await caches.keys();
    for (const key of keys) for (const request of await (await caches.open(key)).keys()) {
      if (["/", "/pedidos", "/historial"].includes(new URL(request.url).pathname)) return true;
    }
    return false;
  });
  expect(cachedPrivatePage).toBe(false);
  // Chromium's page offline emulation does not reliably stop service-worker fetches.
  // Inject the network failure in the worker as well to exercise the real fallback.
  const worker = context.serviceWorkers().find((worker) => new URL(worker.url()).pathname === "/sw.js");
  expect(worker).toBeDefined();
  await worker!.evaluate(() => { globalThis.fetch = async () => { throw new TypeError("P01 simulated offline"); }; });
  await context.setOffline(true);
  expect((await page.goto("/pedidos"))?.status()).toBe(503);
  await expect(page.getByText("Sin conexión. Reconéctate para acceder a tu cuenta y a los pedidos.", { exact: true })).toBeVisible();
});

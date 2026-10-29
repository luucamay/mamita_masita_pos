import { test, expect, type Page } from "@playwright/test";

async function openAdmin(page: Page) {
  // Deny any unexpected business mutation; this suite may only simulate a price PATCH.
  await page.route("**/rest/v1/**", async (route) => {
    if (!["GET", "HEAD"].includes(route.request().method())) {
      await route.abort();
      throw new Error("Unexpected business mutation in P02 test");
    }
    await route.continue();
  });
  await page.goto("/login?next=/menu-admin");
  await page.getByLabel("Correo electrónico").fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Contraseña").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByLabel("Buscar productos", { exact: true })).toBeVisible();
}

test("searches names, categories, accents and inactive products without API calls", async ({ page }) => {
  await openAdmin(page);
  const search = page.getByLabel("Buscar productos", { exact: true });
  const table = page.getByRole("table", { name: "Productos del menú" });
  let catalogRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/rest/v1/menu_items")) catalogRequests++; });
  await search.fill("  cApPuCcInO  ");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("Cappuccino");
  await search.fill("canahua");
  await expect(table).toContainText("Cañahua");
  await search.fill("pina");
  await expect(table).toContainText("Piña");
  await search.fill("cafes");
  const categoryRows = await table.locator("tbody tr").allTextContents();
  expect(categoryRows.length).toBeGreaterThan(1);
  expect(categoryRows.every((text) => text.includes("CAFES"))).toBe(true);
  await search.fill("latte");
  await expect(table.locator("tbody tr")).toHaveCount(3);
  await expect(table).toContainText("Inactivo");
  await search.fill("producto-que-no-existe-p02");
  await expect(table).toContainText("No se encontraron productos");
  await page.getByRole("button", { name: "Limpiar búsqueda", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(table.getByRole("row")).toHaveCount(64);
  expect(catalogRequests).toBe(0);
});

test("keeps an unsaved price while filtering and saves only the selected product", async ({ page }) => {
  await openAdmin(page);
  const search = page.getByLabel("Buscar productos", { exact: true });
  const table = page.getByRole("table", { name: "Productos del menú" });
  await search.fill("Cappuccino");
  const row = table.locator("tbody tr").first();
  const itemId = await row.getAttribute("data-item-id");
  await row.getByRole("button", { name: "Editar precio", exact: true }).click();
  const price = page.getByLabel("Precio de Cappuccino", { exact: true });
  await price.fill("23,50");
  await search.fill("Focaccia");
  await expect(page.getByText("Editando el precio de", { exact: false })).toBeVisible();
  await expect(table.getByRole("button", { name: "Editar precio", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Mostrar producto en edición", exact: true }).click();
  await expect(price).toHaveValue("23,50");
  let intercepted = 0;
  await page.route("**/rest/v1/menu_items**", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    expect(new URL(route.request().url()).searchParams.get("id")).toBe(`eq.${itemId}`);
    expect(route.request().postDataJSON()).toEqual({ price: "23.50" });
    intercepted++;
    // Simulated response only: the real product price is never modified.
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: itemId, price: "23.50" }) });
  });
  await row.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByText("Precio actualizado.", { exact: true })).toBeVisible();
  await expect(row).toContainText("Bs 23.50");
  expect(intercepted).toBe(1);
});

test("rejects invalid prices and preserves an edit when the API denies the save", async ({ page }) => {
  await openAdmin(page);
  await page.getByLabel("Buscar productos", { exact: true }).fill("Cappuccino");
  const row = page.getByRole("table", { name: "Productos del menú" }).locator("tbody tr").first();
  await row.getByRole("button", { name: "Editar precio", exact: true }).click();
  const price = page.getByLabel("Precio de Cappuccino", { exact: true });
  await price.fill("");
  await row.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Escribe un precio válido" })).toBeVisible();
  await price.fill("24.00");
  await page.route("**/rest/v1/menu_items**", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "42501", message: "Acceso denegado de prueba" }) });
  });
  await row.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Acceso denegado de prueba" })).toBeVisible();
  await expect(price).toHaveValue("24.00");
  await page.getByRole("button", { name: "Cancelar edición", exact: true }).click();
  await expect(price).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Editar precio", exact: true })).toBeEnabled();
});

test("search and editing fit desktop and mobile without widening the page", async ({ page }) => {
  await openAdmin(page);
  for (const viewport of [{ width: 1365, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.getByLabel("Buscar productos", { exact: true }).fill("Cappuccino");
    await expect(page.getByLabel("Buscar productos", { exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/p02/search-${viewport.width}.png` });
  }
});

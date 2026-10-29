import { expect, test, type Page } from "@playwright/test";
import { qaOrderCatalog, qaOrderId, qaOrderSnapshot } from "../lib/qa-order-fixture";
import { qaEmployees } from "../lib/qa-employee-fixture";

async function login(page: Page, role = "STAFF", destination = "/pedidos") {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Correo electrónico").fill(process.env[`E2E_${role}_EMAIL`]!);
  await page.getByLabel("Contraseña").fill(process.env[`E2E_${role}_PASSWORD`]!);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test("P03 payment badges match closed cash/QR orders and open unpaid orders", async ({ page }) => {
  await login(page);
  await expect(page.locator('[data-payment-kind="unpaid"]').first()).toBeVisible();
  await page.getByRole("link", { name: "Cerrados", exact: true }).click();
  await expect(page.locator('[data-payment-kind="cash"]').first()).toContainText("Efectivo");
  await expect(page.locator('[data-payment-kind="qr"]').first()).toContainText("QR");
  const order = page.locator("article").filter({ has: page.locator('[data-payment-kind="qr"]') }).first();
  await order.click();
  await expect(page.getByRole("dialog").locator('[data-payment-kind="qr"]')).toContainText("QR");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function mockOrder(page: Page, options: { loseFirstResponse?: boolean; delivered?: boolean; conflict?: boolean } = {}) {
  let snapshot = qaOrderSnapshot();
  if (options.delivered) snapshot.items[0].status = "delivered";
  const requests: string[] = [];
  let saved = false;
  await page.route("**/rest/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/order_items") && route.request().method() === "GET" && url.searchParams.get("order_id") === `eq.${qaOrderId}`) return route.fulfill({ json: snapshot.items });
    if (path.endsWith("/rpc/get_order_edit_snapshot")) return route.fulfill({ json: snapshot });
    if (path.endsWith("/rpc/edit_order")) {
      const body = route.request().postDataJSON();
      expect(body.p_order_id).toBe(qaOrderId);
      requests.push(body.p_request_id);
      if (options.conflict) return route.fulfill({ status: 400, json: { code: "40001", message: "El pedido cambió. Descarta y recarga los datos antes de guardar" } });
      if (options.loseFirstResponse && saved) return route.fulfill({ json: snapshot });
      for (const change of body.p_changes) {
        if (change.action === "add") {
          const product = qaOrderCatalog.find((item) => item.id === change.menu_item_id)!;
          snapshot.items.push({ id: "00000000-0000-4000-8000-000000002003", menu_item_id: product.id, item_name: product.name, category_name: "Café", quantity: change.quantity, unit_price: product.price, line_total: product.price * change.quantity, status: "pending" });
        } else {
          const line = snapshot.items.find((item) => item.id === change.order_item_id)!;
          if (change.action === "remove") line.status = "voided";
          else { line.quantity = change.quantity; line.line_total = Number(line.unit_price) * line.quantity; line.net_total = line.line_total; }
        }
      }
      snapshot.order.total = snapshot.items.filter((line) => line.status !== "voided").reduce((sum, line) => sum + Number(line.line_total), 0);
      snapshot.order.revision++;
      saved = true;
      if (options.loseFirstResponse && requests.length === 1) return route.abort("failed");
      return route.fulfill({ json: snapshot });
    }
    if (!["GET", "HEAD"].includes(route.request().method())) { await route.abort(); throw new Error("Unexpected real mutation in order test"); }
    await route.continue();
  });
  await login(page);
  await page.goto("/qa-preview/orders");
  await page.locator("article").click();
  await page.getByRole("button", { name: "Editar pedido", exact: true }).click();
  await expect(page.getByRole("region", { name: "Editar pedido", exact: true })).toBeVisible();
  return { requests, getSnapshot: () => snapshot };
}

test("P04 edits the same order from 59 to 79 to 69", async ({ page }) => {
  const model = await mockOrder(page);
  await page.getByRole("button", { name: "Agregar Cappuccino QA", exact: true }).click();
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/79[.,]00/).first()).toBeVisible();
  await page.getByRole("button", { name: "Editar pedido", exact: true }).click();
  await page.getByRole("button", { name: "Quitar Espresso QA", exact: true }).click();
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/69[.,]00/).first()).toBeVisible();
  await page.getByRole("button", { name: "Editar pedido", exact: true }).click();
  await page.getByLabel("Cantidad de Focaccia QA", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/118[.,]00/).first()).toBeVisible();
  expect(model.getSnapshot().order.created_at).toBe("2026-10-29T12:00:00Z");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/modules/p04-mobile.png" });
});

test("P04 preserves delivered products and retries with the same operation ID", async ({ page }) => {
  const model = await mockOrder(page, { delivered: true, loseFirstResponse: true });
  await expect(page.getByRole("button", { name: "Quitar Espresso QA", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Agregar Cappuccino QA", exact: true }).click();
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByRole("region", { name: "Editar pedido" }).getByRole("alert")).toBeVisible();
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/79[.,]00/).first()).toBeVisible();
  expect(model.requests[0]).toBe(model.requests[1]);
  expect(model.getSnapshot().items.filter((item) => item.item_name === "Cappuccino QA")).toHaveLength(1);
});

test("P04 exposes concurrent edit conflicts without discarding the draft", async ({ page }) => {
  await mockOrder(page, { conflict: true });
  await page.getByRole("button", { name: "Agregar Cappuccino QA", exact: true }).click();
  await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await expect(page.getByRole("region", { name: "Editar pedido" }).getByRole("alert")).toContainText("El pedido cambió");
  await expect(page.getByRole("button", { name: "Quitar nuevo Cappuccino QA", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Descartar cambios y recargar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Quitar nuevo Cappuccino QA", exact: true })).toHaveCount(0);
});

test("P05 admin creates, deactivates and reactivates synthetic employees on desktop and mobile", async ({ page }) => {
  const employees = structuredClone(qaEmployees);
  const mutations: string[] = [];
  await page.route("**/rest/v1/**", async (route) => {
    if (!["GET", "HEAD"].includes(route.request().method())) { await route.abort(); throw new Error("Unexpected real database mutation"); }
    await route.continue();
  });
  await page.route(/\/api\/employees(?:\/[^/?]+)?(?:\?.*)?$/, async (route) => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ json: { employees } });
    mutations.push(method);
    const body = route.request().postDataJSON();
    if (method === "POST") {
      expect(body.role).toBe("cook");
      expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
      const employee = { id: "00000000-0000-4000-8000-000000005004", full_name: body.fullName, email: body.email, role: body.role, active: true, updated_at: "2026-10-29T13:00:00Z" };
      employees.push(employee); return route.fulfill({ status: 201, json: { employee, resumed: false } });
    }
    if (method === "PATCH") {
      const employee = employees.find((item) => item.id === new URL(route.request().url()).pathname.split("/").at(-1))!;
      expect(body.updatedAt).toBe(employee.updated_at);
      employee.active = body.active;
      employee.updated_at = new Date(Date.parse(employee.updated_at) + 1000).toISOString();
      return route.fulfill({ json: { employee } });
    }
    await route.abort(); throw new Error("Unexpected employee method");
  });
  await login(page, "ADMIN");
  await page.goto("/qa-preview/employees");
  await expect(page.getByRole("article", { name: "Administradora QA", exact: true }).getByRole("button", { name: "Desactivar acceso" })).toBeDisabled();
  await page.screenshot({ path: "test-results/modules/p05-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Agregar empleado", exact: true }).click();
  await page.getByLabel("Nombre completo", { exact: true }).fill("Nueva Cocinera QA");
  await page.getByLabel("Correo electrónico", { exact: true }).fill("nueva@example.test");
  await page.getByLabel("Rol", { exact: true }).selectOption("cook");
  await page.getByLabel("Contraseña inicial", { exact: true }).fill("Synthetic12345");
  await page.getByRole("button", { name: "Crear acceso", exact: true }).click();
  const employee = page.getByRole("article", { name: "Nueva Cocinera QA", exact: true });
  await expect(employee).toContainText("Cocina"); await expect(employee).toContainText("nueva@example.test");
  page.once("dialog", (dialog) => dialog.accept());
  await employee.getByRole("button", { name: "Desactivar acceso" }).click();
  await expect(employee).toContainText("Inactivo");
  await employee.getByRole("button", { name: "Reactivar acceso" }).click();
  await expect(employee.getByRole("button", { name: "Desactivar acceso" })).toBeVisible();
  expect(mutations).toEqual(["POST", "PATCH", "PATCH"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/modules/p05-mobile.png", fullPage: true });
});

test("P05 preserves the creation form and operation ID after a failed response", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/employees", async (route) => {
    const body = route.request().postDataJSON(); requests.push(body.requestId);
    if (requests.length === 1) return route.fulfill({ status: 503, json: { error: "Falta completar el perfil. Reintenta con los mismos datos." } });
    return route.fulfill({ status: 201, json: { employee: { ...qaEmployees[1], id: "00000000-0000-4000-8000-000000005004", full_name: body.fullName, email: body.email }, resumed: true } });
  });
  await login(page, "ADMIN"); await page.goto("/qa-preview/employees");
  await page.getByRole("button", { name: "Agregar empleado", exact: true }).click();
  await page.getByLabel("Nombre completo").fill("Retry QA"); await page.getByLabel("Correo electrónico").fill("retry@example.test"); await page.getByLabel("Contraseña inicial").fill("Synthetic12345");
  await page.getByRole("button", { name: "Crear acceso", exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toContainText("Reintenta");
  await expect(page.getByLabel("Nombre completo")).toHaveValue("Retry QA");
  await page.getByRole("button", { name: "Crear acceso", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("primer intento");
  expect(requests).toHaveLength(2); expect(requests[0]).toBe(requests[1]);
});

test("P05 staff cannot see employees or call the administrative API", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("link", { name: "Empleados", exact: true })).toHaveCount(0);
  await page.goto("/empleados"); await expect(page).toHaveURL("/");
  const response = await page.request.get("/api/employees");
  expect(response.status()).toBe(403); expect(response.headers()["cache-control"]).toContain("no-store");
});

test("P05 reflects database readiness and rejects cross-site requests", async ({ page }) => {
  await login(page, "ADMIN", "/empleados");
  const response = await page.request.get("/api/employees");
  if (response.status() === 503) {
    await expect(page.locator('p[role="alert"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Agregar empleado", exact: true })).toBeDisabled();
  } else {
    expect(response.status()).toBe(200);
    expect(Array.isArray((await response.json()).employees)).toBe(true);
    await expect(page.getByRole("button", { name: "Agregar empleado", exact: true })).toBeEnabled();
  }
  const crossSite = await page.request.post("/api/employees", { headers: { Origin: "https://unrelated.example" }, data: {} });
  expect(crossSite.status()).toBe(403);
});

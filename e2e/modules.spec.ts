import { expect, test, type Page } from "@playwright/test";
import { qaOrderCatalog, qaOrderId, qaOrderSnapshot } from "../lib/qa-order-fixture";

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

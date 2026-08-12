import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test("completes an order and verifies payment details", async ({ page }) => {
  test.skip(!email || !password, "Set E2E_EMAIL and E2E_PASSWORD for an authenticated E2E run");

  const customer = `E2E ${Date.now()}`;
  const table = String(Math.floor(Math.random() * 900) + 100);

  await page.goto("/login?next=/");
  await page.getByLabel("Correo electrónico").fill(email!);
  await page.getByLabel("Contraseña").fill(password!);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("button", { name: "Agregar Cappuccino" }).click();
  await page.getByLabel("Nro. de mesa *").fill(table);
  await page.getByLabel("Nombre del cliente (opcional)").fill(customer);
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page).toHaveURL(/\/pedidos$/);

  const order = page.getByRole("article").filter({ hasText: customer });
  await expect(order).toContainText("confirmado");
  await order.getByRole("button", { name: "Entregado" }).click();
  await expect(order).toContainText("entregado");

  await order.click();
  const detail = page.getByRole("dialog");
  await expect(detail).toContainText("Cappuccino");
  await detail.getByRole("button", { name: "QR" }).click();
  await detail.getByRole("button", { name: "Pagar" }).click();

  await page.getByRole("link", { name: "Cerrados" }).click();
  const closedOrder = page.getByRole("article").filter({ hasText: customer });
  await expect(closedOrder).toContainText("archivado");
  await closedOrder.click();
  await expect(page.getByRole("dialog")).toContainText("Pago");
  await expect(page.getByRole("dialog")).toContainText("QR");
});

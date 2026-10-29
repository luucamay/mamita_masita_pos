import { expect, test, type Page } from "@playwright/test";

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

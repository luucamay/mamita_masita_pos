import {isReadOnlyTestRequest} from "./safe-requests";
import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, role = "ADMIN") {
  await page.route("**/rest/v1/**", async route => { if (!isReadOnlyTestRequest(route.request())) { await route.abort(); throw new Error("Unexpected real mutation in dashboard tests"); } await route.continue(); });
  await page.goto("/login"); await page.getByLabel("Correo electrónico").fill(process.env[`E2E_${role}_EMAIL`]!); await page.getByLabel("Contraseña").fill(process.env[`E2E_${role}_PASSWORD`]!); await page.getByRole("button", { name: "Ingresar", exact: true }).click();
}
test("P11 administrator starts on today's dashboard and can take an order", async ({ page }) => {
  await login(page); await expect(page).toHaveURL("/historial"); await expect(page.getByTestId("summary-total")).toContainText("Total del día");
  await page.getByRole("link", { name: "Tomar pedido", exact: true }).click(); await expect(page).toHaveURL("/menu"); await expect(page.getByPlaceholder("Buscar ítem...")).toBeVisible();
  await page.goto("/"); await expect(page).toHaveURL("/historial");
});
test("P11 product dashboard reconciles the real day and keeps the breakdown accessible", async ({ page }) => {
  await login(page); await expect(page).toHaveURL("/historial"); await page.goto("/historial?date=2026-10-17");
  const table = page.getByRole("table", { name: "Ventas por producto", exact: true }); await expect(table.locator("tbody tr")).toHaveCount(4);
  const cappuccino = table.getByRole("row").filter({ hasText: "Cappuccino" }); await expect(cappuccino.locator("td").nth(0)).toHaveText("1"); await expect(cappuccino.locator("td").nth(1)).toContainText(/20[,.]00/);
  const detail = page.locator("details summary"); await detail.focus(); await page.keyboard.press("Enter"); await expect(page.getByRole("region", { name: "Productos vendidos", exact: true })).toBeVisible(); await detail.click(); await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: "test-results/dashboard/dashboard-desktop.png", fullPage: true, animations: "disabled" }); await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: "test-results/dashboard/dashboard-mobile.png", fullPage: true, animations: "disabled" });
});
test("P11 staff still starts on the order menu and cannot view the dashboard", async ({ page }) => {
  await login(page, "STAFF"); await expect(page).toHaveURL("/"); await expect(page.getByPlaceholder("Buscar ítem...")).toBeVisible(); await page.goto("/historial"); await expect(page).toHaveURL("/");
});

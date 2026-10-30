import { test, expect, type Page } from "@playwright/test";
import reference from "./report-reference.json";
const money = (n: number) => new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(n);
async function login(page: Page) {
  await page.route("**/rest/v1/**", async route => {
    if (!["GET", "HEAD"].includes(route.request().method()) && !new URL(route.request().url()).pathname.endsWith("/rpc/get_sales_report")) { await route.abort(); throw new Error("Unexpected real mutation in report tests"); }
    await route.continue();
  });
  await page.goto("/login?next=%2Fhistorial%3Fdate%3D2026-10-17");
  await page.getByLabel("Correo electrónico").fill(process.env.E2E_ADMIN_EMAIL!);
  await page.getByLabel("Contraseña").fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Historial y reportes", exact: true })).toBeVisible();
}
test("P09 real daily, weekly and monthly results match the independent payment snapshot", async ({ page }) => {
  await login(page);
  for (const [period, label, range] of [["daily", "Diario", "17/10/2026"], ["weekly", "Semanal", "12/10/2026 al 18/10/2026"], ["monthly", "Mensual", "01/10/2026 al 31/10/2026"]] as const) {
    await page.getByRole("link", { name: label, exact: true }).click();
    await expect(page.getByTestId("report-range")).toContainText(range);
    await expect(page.getByTestId("filtered-total")).toContainText(money(reference[period].total));
    await expect(page.getByTestId("filtered-total")).toContainText(`${reference[period].orders} pedidos`);
    await expect(page.getByTestId("filtered-total")).toContainText(`${reference[period].units} unidades`);
  }
});
test("P09 payment and purchase filters also govern CSV; invalid export dates are rejected", async ({ page }) => {
  await login(page); await page.goto("/historial?period=weekly&date=2026-10-17");
  await page.getByLabel("Medio de pago del detalle").selectOption("qr");
  await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(page.getByTestId("filtered-total")).toContainText(money(reference.weekly.qr));
  const link = page.getByRole("link", { name: "Exportar CSV", exact: true });
  const href = await link.getAttribute("href"); expect(href).toContain("payment=qr"); expect(href).toContain("date=2026-10-17");
  const response = await page.request.get(href!); expect(response.status()).toBe(200);
  const csv = await response.text(); expect(csv).toContain("Purchase Type"); expect(csv).not.toContain(",Efectivo,"); expect(csv).toContain(",QR,");
  expect((await page.request.get("/historial/export?period=daily&date=2026-02-30")).status()).toBe(400);
  expect((await page.request.get("/historial/export?period=daily&period=monthly")).status()).toBe(400);
  await page.getByLabel("Tipo de compra").selectOption("employee"); await page.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
  await expect(page.getByText("No hay ventas cobradas con estos filtros.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("filtered-total")).toContainText(money(0));
});
test("P09 navigation boundaries, invalid parameters and mobile layout", async ({ page }) => {
  await login(page); await page.getByRole("link", { name: "Anterior", exact: true }).click();
  await expect(page.getByTestId("report-range")).toContainText("16/10/2026");
  await page.getByRole("link", { name: "Siguiente", exact: true }).click(); await expect(page.getByTestId("report-range")).toContainText("17/10/2026");
  await page.screenshot({ path: "test-results/reports/report-desktop.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/reports/report-mobile.png", fullPage: true, animations: "disabled" });
  await page.goto("/historial?date=2026-02-30"); await expect(page.getByRole("alert").filter({hasText:"Filtros inválidos"})).toContainText("Filtros inválidos");
  await expect(page.getByTestId("filtered-total")).toHaveCount(0);
});

import { test, expect, type Page } from "@playwright/test";
import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
async function login(page: Page) {
  await page.goto("/login?next=%2Fhistorial%3Fdate%3D2026-10-17");
  await page.getByLabel("Correo electrónico").fill(process.env.E2E_ADMIN_EMAIL!); await page.getByLabel("Contraseña").fill(process.env.E2E_ADMIN_PASSWORD!); await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Historial y reportes", exact: true })).toBeVisible();
}
test("P12 downloads the real day's styled Excel on desktop and mobile", async ({ page }) => {
  await login(page);
  const folder = "../outputs/p11_p12_2026-10-30"; await mkdir(folder, { recursive: true });
  for (const mobile of [false, true]) {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const event = page.waitForEvent("download"); await page.getByRole("link", { name: "Exportar Excel", exact: true }).click(); const download = await event;
    expect(download.suggestedFilename()).toBe("reporte-ventas-daily-2026-10-17-all-all.xlsx"); expect(await download.failure()).toBeNull();
    const path = mobile ? "test-results/p12-mobile-download.xlsx" : `${folder}/reporte-diario-2026-10-17.xlsx`; await download.saveAs(path);
    const book = new ExcelJS.Workbook(); await book.xlsx.readFile(path); const sheet = book.getWorksheet("Ventas")!;
    expect(sheet.getCell("C10").value).toBe(54); expect(sheet.getCell("C11").value).toBe(4); expect(sheet.getCell("E10").value).toBe(1);
    expect(sheet.getCell("C18").result).toBe(54); expect(sheet.getCell("B14").type).toBe(ExcelJS.ValueType.Number); expect(sheet.getCell("A13").value).toBe("Ítem");
    expect(sheet.getCell("A13").fill.type).toBe("pattern"); expect(book.worksheets).toHaveLength(1);
  }
});
test("P12 empty employee filter exports zero with no invented sales", async ({ page }) => {
  await login(page); const response = await page.request.get("/historial/export?period=daily&date=2026-10-17&purchase=employee&payment=all");
  expect(response.status()).toBe(200); expect(response.headers()["content-type"]).toContain("spreadsheetml.sheet"); expect(response.headers()["cache-control"]).toContain("no-store");
  const book = new ExcelJS.Workbook(); await book.xlsx.load(new Uint8Array(await response.body()).buffer); const sheet = book.getWorksheet("Ventas")!;
  expect(sheet.getCell("C10").value).toBe(0); expect(sheet.getCell("B7").value).toBe("Empleados"); expect(sheet.getCell("A16").value).toContain("Sin ventas cobradas");
});

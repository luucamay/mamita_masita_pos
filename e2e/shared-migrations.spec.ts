import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const privatePath = resolve(process.cwd(), "../SUPABASE/RESPALDOS_PRIVADOS/2026-10-29_migraciones/qa-p05-access.json");
const fixture = JSON.parse(readFileSync(privatePath, "utf8"));
if (fixture.email !== "qa-p05-20261029@mamita-masita.test" || fixture.runId !== "MM-TEST-20261029-P05") throw new Error("Unexpected employee test identity.");
async function login(page: Page, email: string, password: string, destination = "/") {
  await page.goto(`/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test("real P05 creates one QA account, blocks its active session and reactivates the same credentials", async ({ page, browser, baseURL }) => {
  await login(page, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!, "/empleados");
  await expect(page.getByRole("heading", { name: "Empleados", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Agregar empleado", exact: true })).toBeEnabled();
  const card = page.getByRole("article", { name: fixture.fullName, exact: true });
  if (await card.count() === 0) {
    await page.getByRole("button", { name: "Agregar empleado", exact: true }).click();
    await page.getByLabel("Nombre completo", { exact: true }).fill(fixture.fullName);
    await page.getByLabel("Correo electrónico", { exact: true }).fill(fixture.email);
    await page.getByLabel("Rol", { exact: true }).selectOption("staff");
    await page.getByLabel("Contraseña inicial", { exact: true }).fill(fixture.password);
    const [response] = await Promise.all([page.waitForResponse((response) => new URL(response.url()).pathname === "/api/employees" && response.request().method() === "POST"), page.getByRole("button", { name: "Crear acceso", exact: true }).click()]);
    const result = await response.json();
    if (response.status() !== 201) throw new Error(`Employee creation returned ${response.status()}: ${result.error ?? "unknown failure"}`);
    fixture.id = result.employee.id;
    writeFileSync(privatePath, JSON.stringify(fixture, null, 2) + "\n");
  }
  await expect(card).toBeVisible();
  if (await card.getByRole("button", { name: "Reactivar acceso", exact: true }).count()) await card.getByRole("button", { name: "Reactivar acceso", exact: true }).click();
  await expect(card.getByRole("button", { name: "Desactivar acceso", exact: true })).toBeEnabled();
  const employeeSession = await browser.newContext({ baseURL });
  const employeePage = await employeeSession.newPage();
  try {
    await login(employeePage, fixture.email, fixture.password);
    await expect(employeePage).toHaveURL("/");
    const forbidden = await employeePage.request.get("/api/employees"); expect(forbidden.status()).toBe(403);
    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "Desactivar acceso", exact: true }).click();
    await expect(card.getByRole("button", { name: "Reactivar acceso", exact: true })).toBeVisible();
    await employeePage.reload(); await expect(employeePage).toHaveURL(/\/login/);
    const inactive = await employeePage.request.get("/api/employees"); expect(inactive.status()).toBe(401);
    await card.getByRole("button", { name: "Reactivar acceso", exact: true }).click();
    await expect(card.getByRole("button", { name: "Desactivar acceso", exact: true })).toBeVisible();
    const freshSession = await browser.newContext({ baseURL });
    try { const freshPage = await freshSession.newPage(); await login(freshPage, fixture.email, fixture.password); await expect(freshPage).toHaveURL("/"); }
    finally { await freshSession.close(); }
  } finally {
    await employeeSession.close();
    // Only this exact test card is touched; preserve it inactive for traceability.
    if (await card.getByRole("button", { name: "Desactivar acceso", exact: true }).count()) {
      page.once("dialog", (dialog) => dialog.accept());
      await card.getByRole("button", { name: "Desactivar acceso", exact: true }).click();
      await expect(card.getByRole("button", { name: "Reactivar acceso", exact: true })).toBeVisible();
    }
    fixture.finalState = "inactive";
    writeFileSync(privatePath, JSON.stringify(fixture, null, 2) + "\n");
  }
});

test("real P04 reads an existing order and cancels a draft without changing it", async ({ page }) => {
  await login(page, process.env.E2E_STAFF_EMAIL!, process.env.E2E_STAFF_PASSWORD!, "/pedidos");
  const order = page.locator("article").first();
  await expect(order).toBeVisible();
  await order.click();
  await page.getByRole("button", { name: "Editar pedido", exact: true }).click();
  const editor = page.getByRole("region", { name: "Editar pedido", exact: true });
  await expect(editor.getByText("Total estimado", { exact: true })).toBeVisible();
  await editor.getByLabel("Buscar producto para agregar").fill("Cappuccino");
  await editor.getByRole("button", { name: "Agregar Cappuccino", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Guardar cambios", exact: true })).toBeEnabled();
  await editor.getByRole("button", { name: "Cancelar cambios", exact: true }).click();
  await expect(editor).toHaveCount(0);
});

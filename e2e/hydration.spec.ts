import { expect, test } from "@playwright/test";

for (const timezoneId of ["America/La_Paz", "Asia/Tokyo"]) {
  test(`SSR dates hydrate unchanged with browser timezone ${timezoneId}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, timezoneId, locale: "es-BO" });
    const page = await context.newPage();
    const hydrationErrors: string[] = [];
    const capture = (text: string) => { if (/hydration|hydrating|server rendered|Minified React error #(418|423|425)/i.test(text)) hydrationErrors.push(text); };
    page.on("pageerror", (error) => capture(error.message));
    page.on("console", (message) => { if (message.type() === "error") capture(message.text()); });
    try {
      await page.goto("/login?next=%2Fpedidos");
      await page.getByLabel("Correo electrónico").fill(process.env.E2E_STAFF_EMAIL!);
      await page.getByLabel("Contraseña").fill(process.env.E2E_STAFF_PASSWORD!);
      await page.getByRole("button", { name: "Ingresar", exact: true }).click();
      await expect(page).toHaveURL("/pedidos");
      // A document reload exercises SSR hydration, rather than only a client transition.
      for (const path of ["/pedidos", "/pedidos?view=closed"]) {
        const response = await page.goto(path);
        const html = await response!.text();
        const serverDates = [...html.matchAll(/\d{2}\/\d{2}, \d{2}:\d{2} [ap]\. m\./g)].map((match) => match[0]);
        expect(serverDates.length).toBeGreaterThan(0);
        const card = page.locator("article").first();
        await expect(card).toBeVisible();
        const text = await card.textContent();
        const renderedDate = text!.match(/\d{2}\/\d{2}, \d{2}:\d{2} [ap]\. m\./)?.[0];
        expect(renderedDate).toBeDefined();
        expect(renderedDate).toBe(serverDates[0]);
        expect(text).not.toMatch(/[ap]\.\u00a0m\.|[ap]\.\u202fm\./);
        // Opening the dialog proves React attached events to the server markup.
        await card.getByRole("heading").first().click(); await expect(page.getByRole("dialog")).toBeVisible();
      }
      for (const path of ["/cafe", "/cocina"]) {
        await page.goto(path);
        await expect(page.locator("main")).toBeVisible();
      }
      expect(hydrationErrors).toEqual([]);
    } finally { await context.close(); }
  });
}

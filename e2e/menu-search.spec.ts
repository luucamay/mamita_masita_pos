import { test, expect, type Page } from "@playwright/test";
async function openAdmin(page: Page) {
 await page.route("**/rest/v1/**", async route => {
  if (!["GET", "HEAD"].includes(route.request().method())) { await route.abort(); throw new Error("Unexpected catalog mutation"); }
  await route.continue();
 });
 await page.goto("/login?next=/menu-admin");
 await page.getByLabel("Correo electrónico").fill(process.env.E2E_ADMIN_EMAIL!);
 await page.getByLabel("Contraseña").fill(process.env.E2E_ADMIN_PASSWORD!);
 await page.getByRole("button", { name: "Ingresar" }).click();
 await expect(page.getByRole("heading", { name: "Menú admin", exact: true })).toBeVisible();
 await page.getByRole("button", { name: /^Productos del menú/ }).click();
 await expect(page.getByLabel("Buscar productos", { exact: true })).toBeVisible();
}
test("catalog search matches accents, categories and retired products without extra requests", async ({ page }) => {
 await openAdmin(page);
 const search = page.getByLabel("Buscar productos", { exact: true });
 const list = page.getByRole("list", { name: "Productos del menú" });
 let requests = 0; page.on("request", r => { if(r.url().includes("/rest/v1/menu_items")) requests++; });
 await search.fill("  cApPuCcInO  "); await expect(list.locator("li")).toHaveCount(1);
 await search.fill("canahua"); await expect(list).toContainText("Cañahua");
 await search.fill("pina"); await expect(list).toContainText("Piña");
 await search.fill("cafes"); expect((await list.locator("li").allTextContents()).every(text => text.includes("CAFES"))).toBe(true);
 await search.fill("latte"); await expect(list.locator("li")).toHaveCount(3); await expect(list).toContainText("Retirado");
 await search.fill("producto-que-no-existe-p02"); await expect(page.getByText(/No se encontraron productos/)).toBeVisible();
 await page.getByRole("button", { name: "Limpiar búsqueda", exact: true }).click(); await expect(search).toHaveValue(""); await expect(search).toBeFocused();
 await expect(list.locator("li")).toHaveCount(63); expect(requests).toBe(0);
});
test("full product modal saves name, category and comma price only for the selected item", async ({ page }) => {
 await openAdmin(page); await page.getByLabel("Buscar productos", { exact: true }).fill("Cappuccino");
 const row = page.getByRole("list", { name: "Productos del menú" }).locator("li").first(), id = await row.getAttribute("data-item-id");
 await row.getByRole("button", { name: "Editar Cappuccino", exact: true }).click();
 await page.getByLabel("Nombre del producto", { exact: true }).fill("Cappuccino QA editado");
 const category = page.getByRole("dialog").getByLabel("Categoría", { exact: true });
 const original = await category.inputValue();
 const next = await category.locator("option").evaluateAll((options, old) => options.map(o => ({ id: (o as HTMLOptionElement).value, name: o.textContent })).find(o => o.id && o.id !== old), original);
 await category.selectOption(next!.id);
 await page.getByLabel("Precio (Bs)", { exact: true }).fill("23,50");
 let calls=0;
 await page.route("**/rest/v1/menu_items**", async route => {
  if(route.request().method()!=="PATCH") return route.fallback();
  expect(new URL(route.request().url()).searchParams.get("id")).toBe(`eq.${id}`);
  expect(route.request().postDataJSON()).toEqual({name:"Cappuccino QA editado",price:"23.50",category_id:next!.id}); calls++;
  await route.fulfill({json:{id,...route.request().postDataJSON(),active:true,sort_order:0,updated_at:"2026-10-30T14:00:00Z"}});
 });
 await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
 await expect(page.getByRole("status").filter({hasText:"Producto actualizado."})).toBeVisible();
 await expect(row).toContainText("Bs 23.50"); await expect(row).toContainText(next!.name!); expect(calls).toBe(1);
});
test("invalid prices and API errors keep the full editing draft; cancel preserves the catalog", async ({ page }) => {
 await openAdmin(page); await page.getByLabel("Buscar productos", { exact: true }).fill("Cappuccino");
 await page.getByRole("button", { name: "Editar Cappuccino", exact: true }).click();
 const price=page.getByLabel("Precio (Bs)",{exact:true});
 await price.fill("-1"); await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();
 await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Escribe un precio válido");
 await price.fill("24.00");
 await page.route("**/rest/v1/menu_items**", async route=>{
  if(route.request().method()!=="PATCH") return route.fallback();
  await route.fulfill({status:403,json:{code:"42501",message:"Acceso denegado de prueba"}});
 });
 await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();
 await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Acceso denegado de prueba"); await expect(price).toHaveValue("24.00");
 await page.getByRole("button",{name:"Cancelar",exact:true}).click();
 await expect(page.getByRole("dialog",{name:"Productos del menú",exact:true})).toBeVisible();
 await expect(page.getByRole("list",{name:"Productos del menú"})).toContainText("Bs 20.00");
});
test("three menu cards, dialogs and full editing fit desktop and mobile with keyboard dismissal", async({page})=>{
 await openAdmin(page); await page.keyboard.press("Escape");
 for(const viewport of [{width:1365,height:900},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  await expect(page.getByRole("button",{name:/^Nuevo producto/})).toBeInViewport();
  await page.screenshot({path:`test-results/admin/menu-${viewport.width}.png`,animations:"disabled"});
  await page.getByRole("button",{name:/^Productos del menú/}).click();
  await page.getByLabel("Buscar productos",{exact:true}).fill("Cappuccino");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/admin/catalog-${viewport.width}.png`,animations:"disabled"});
  await page.getByRole("button",{name:"Editar Cappuccino",exact:true}).click();
  await expect(page.getByLabel("Nombre del producto",{exact:true})).toBeInViewport();
  await page.screenshot({path:`test-results/admin/edit-${viewport.width}.png`,animations:"disabled"});
  await page.keyboard.press("Escape"); await expect(page.getByRole("dialog")).toHaveCount(0);
 }
});

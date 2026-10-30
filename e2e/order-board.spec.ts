import { test,expect,type Page } from "@playwright/test";
async function login(page:Page,role="STAFF"){
 await page.goto("/login?next=%2Fpedidos");await page.getByLabel("Correo electrónico").fill(process.env[`E2E_${role}_EMAIL`]!);await page.getByLabel("Contraseña").fill(process.env[`E2E_${role}_PASSWORD`]!);await page.getByRole("button",{name:"Ingresar",exact:true}).click();await expect(page).not.toHaveURL(/\/login/);
}
test("P13 live snapshot API validates view and permissions without caching private data",async({page,request})=>{
 const guest=await request.get("/api/orders/live");expect(guest.status()).toBe(401);expect(guest.headers()["cache-control"]).toContain("no-store");
 await login(page);await expect(page.getByTestId("live-status")).toContainText("En vivo");const result=await page.request.get("/api/orders/live?view=active");expect(result.status()).toBe(200);expect(result.headers()["cache-control"]).toContain("private");
 const body=await result.json();expect(Number.isFinite(Date.parse(body.server_time))).toBe(true);expect(Array.isArray(body.orders)).toBe(true);expect(body.orders.every((order:any)=>Array.isArray(order.items))).toBe(true);
 expect((await page.request.get("/api/orders/live?view=invalid")).status()).toBe(400);expect((await page.request.get("/api/orders/live?selected=invalid")).status()).toBe(400);
 await page.getByRole("button",{name:"Salir",exact:true}).click();await login(page,"COOK");expect((await page.request.get("/api/orders/live")).status()).toBe(403);
});
test("P13 failed refresh retains the last cards and recovers on a successful read",async({page})=>{
 await login(page);await expect(page.getByTestId("live-status")).toContainText("En vivo");const count=await page.locator("article[data-order-id]").count();expect(count).toBeGreaterThan(0);
 await page.route("**/api/orders/live?**",route=>route.fulfill({status:503,json:{error:"simulated outage"}}));await page.getByRole("button",{name:"Actualizar pedidos",exact:true}).click();await expect(page.getByRole("alert").filter({hasText:"última lectura"})).toBeVisible();await expect(page.locator("article[data-order-id]")).toHaveCount(count);
 await page.unroute("**/api/orders/live?**");await page.getByRole("button",{name:"Actualizar pedidos",exact:true}).click();await expect(page.getByRole("alert").filter({hasText:"última lectura"})).toHaveCount(0);await expect(page.getByTestId("live-status")).toContainText("En vivo");
});

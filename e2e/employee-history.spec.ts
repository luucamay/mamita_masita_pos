import {test,expect,type Page} from "@playwright/test";
import {isReadOnlyTestRequest} from "./safe-requests";

async function login(page:Page,role="ADMIN",next="/empleados"){
 await page.goto("/login?next="+encodeURIComponent(next));
 await page.getByLabel("Correo electrónico").fill(process.env[`E2E_${role}_EMAIL`]!);
 await page.getByLabel("Contraseña").fill(process.env[`E2E_${role}_PASSWORD`]!);
 await page.getByRole("button",{name:"Ingresar",exact:true}).click();
 await expect(page).not.toHaveURL(/\/login/);
}
test.beforeEach(async({page})=>{
 await page.route("**/rest/v1/**",route=>isReadOnlyTestRequest(route.request())?route.continue():route.abort());
});

test("legacy employee identifiers load today's real history and keep administrator authorization",async({page})=>{
 const staff="/api/employees/22222222-2222-2222-2222-222222222222/sales";
 expect((await page.request.get(staff)).status()).toBe(401);
 await login(page,"COOK","/cocina");
 expect((await page.request.get(staff)).status()).toBe(403);
 await page.getByRole("button",{name:"Salir",exact:true}).click();
 await expect(page).toHaveURL(/\/login/);
 await login(page);
 for(const id of ["22222222-2222-2222-2222-222222222222","11111111-1111-1111-1111-111111111111"]){
  const response=await page.request.get(`/api/employees/${id}/sales`);
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const result=await response.json();
  expect(result.range.start).toBe(result.range.today);expect(result.range.end).toBe(result.range.today);
  expect(result.summary.orders).toBeGreaterThanOrEqual(0);
 }
 for(const query of ["?start=2026-02-30&end=2026-03-01","?start=2026-01-01&end=2027-01-02","?page=-1","?page=0&page=1"]){
  expect((await page.request.get(staff+query)).status()).toBe(400);
 }
 expect((await page.request.get("/api/employees/not-a-uuid/sales")).status()).toBe(400);
 await page.getByRole("article",{name:"Staff User",exact:true}).getByRole("button",{name:"Historial de ventas",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"Ventas de Staff User",exact:true});
 await expect(dialog.getByTestId("employee-sales-range")).toBeVisible();
 await expect(dialog.getByRole("alert")).toHaveCount(0);
 await expect(dialog.getByLabel("Desde",{exact:true})).not.toHaveValue("");
 for(const width of [1365,390]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/employee-history/real-history-${width}.png`,animations:"disabled"});
 }
});

test("refresh picks up new sales without reopening and preserves the selected range and date drafts",async({page})=>{
 let count=1,fail=false;const calls:URL[]=[];
 await page.route("**/api/employees/*/sales*",async route=>{
  const url=new URL(route.request().url());calls.push(url);
  if(fail){fail=false;return route.fulfill({status:503,json:{error:"Historial temporalmente no disponible."}});}
  const start=url.searchParams.get("start")??"2026-11-03",end=url.searchParams.get("end")??start;
  await route.fulfill({json:{range:{start,end,today:"2026-11-03"},page:0,page_size:25,total_count:count,
   summary:{orders:count,total:count*20,collected:count*20,pending:0},orders:[]}});
 });
 await login(page);await page.goto("/qa-preview/employees");
 await page.getByRole("article",{name:"Atención QA",exact:true}).getByRole("button",{name:"Historial de ventas",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"Ventas de Atención QA",exact:true});
 const orders=dialog.locator("dl > div").filter({has:page.locator("dt",{hasText:"Pedidos"})}).locator("dd");
 await expect(orders).toHaveText("1");
 const start=dialog.getByLabel("Desde",{exact:true}),end=dialog.getByLabel("Hasta",{exact:true});
 await expect(start).toHaveValue("2026-11-03");await expect(end).toHaveValue("2026-11-03");
 count=2;await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
 await expect(orders).toHaveText("2");
 await start.fill("2026-10-01");await end.fill("2026-10-31");
 await dialog.getByRole("button",{name:"Filtrar",exact:true}).click();
 await expect(dialog.getByTestId("employee-sales-range")).toHaveText("01/10/2026 al 31/10/2026");
 await start.fill("2026-09-01");await end.fill("2026-09-30");
 count=3;await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
 await expect(orders).toHaveText("3");
 expect(calls.at(-1)!.searchParams.get("start")).toBe("2026-10-01");
 await expect(start).toHaveValue("2026-09-01");await expect(end).toHaveValue("2026-09-30");
 fail=true;await dialog.getByRole("button",{name:"Actualizar",exact:true}).click();
 await expect(dialog.getByRole("alert")).toContainText("temporalmente");await expect(orders).toHaveText("3");
 count=4;await dialog.getByRole("button",{name:"Reintentar",exact:true}).click();
 await expect(dialog.getByRole("alert")).toHaveCount(0);await expect(orders).toHaveText("4");
 expect(calls.at(-1)!.searchParams.get("start")).toBe("2026-10-01");
 await dialog.getByRole("button",{name:"Hoy",exact:true}).click();
 await expect(start).toHaveValue("2026-11-03");expect(calls.at(-1)!.searchParams.has("start")).toBe(false);
});

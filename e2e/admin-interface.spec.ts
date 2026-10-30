import {test,expect,type Page} from "@playwright/test";
import ExcelJS from "exceljs";
import reference from "./report-reference.json";
import {qaEmployees} from "../lib/qa-employee-fixture";
async function login(page:Page,role="ADMIN",next="/empleados"){
 await page.goto("/login?next="+encodeURIComponent(next));
 await page.getByLabel("Correo electrónico").fill(process.env[`E2E_${role}_EMAIL`]!);
 await page.getByLabel("Contraseña").fill(process.env[`E2E_${role}_PASSWORD`]!);
 await page.getByRole("button",{name:"Ingresar",exact:true}).click(); await expect(page).not.toHaveURL(/\/login/);
 if(next.startsWith("/qa-preview/")) await page.goto(next);
}
test("employee role filters, secure password generation and modal cancellation do not create an account",async({page})=>{
 await login(page,"ADMIN","/qa-preview/employees");
 let writes=0;await page.route("**/api/employees",async route=>{if(route.request().method()!=="GET"){writes++;await route.abort();}else await route.continue();});
 const roles=page.getByRole("group",{name:"Filtrar empleados por rol"});
 await expect(roles.getByRole("button")).toHaveText(["Todos3","Administrador1","Atención1","Cocina0","Barista1"]);
 await roles.getByRole("button",{name:/^Barista/}).click();
 await expect(page.getByRole("article")).toHaveCount(1);await expect(page.getByRole("article")).toContainText("Inactivo");
 await page.getByRole("button",{name:"Agregar empleado",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"Nuevo empleado",exact:true});
 await dialog.getByRole("button",{name:"Generar contraseña",exact:true}).click();
 const password=dialog.getByLabel("Contraseña inicial",{exact:true}),first=await password.inputValue();
 expect(first).toMatch(/^(?=.*[A-Za-z])(?=.*\d).{20}$/);
 await dialog.getByRole("button",{name:"Generar contraseña",exact:true}).click();expect(await password.inputValue()).not.toBe(first);
 await page.screenshot({path:"test-results/admin/employee-create-desktop.png",animations:"disabled",mask:[password]});
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:"test-results/admin/employee-create-mobile.png",animations:"disabled",mask:[password]});
 await dialog.getByRole("button",{name:"Cancelar",exact:true}).click();await expect(dialog).toHaveCount(0);expect(writes).toBe(0);
 await page.getByRole("button",{name:"Agregar empleado",exact:true}).click();await expect(password).toHaveValue("");await page.keyboard.press("Escape");
 await expect(page.getByRole("button",{name:"Agregar empleado",exact:true})).toBeFocused();
});
test("employee history supports day, week and custom ranges, separate cashier and retry without mixing personal purchases",async({page})=>{
 const calls:string[]=[];let fail=false;
 await page.route("**/api/employees/*/sales*",async route=>{
  const url=new URL(route.request().url());calls.push(url.search);
  if(fail){fail=false;return route.fulfill({status:503,json:{error:"No se pudo consultar el historial de prueba."}});}
  const start=url.searchParams.get("start")??"2026-10-30",end=url.searchParams.get("end")??start;
  await route.fulfill({json:{range:{start,end,today:"2026-10-30"},page:0,page_size:25,total_count:1,summary:{orders:1,total:50,collected:50,pending:0},orders:[{id:"order-test",order_number:"QA-VENTA",table_number:"Mesa 3",customer_name:null,created_at:"2026-10-30T14:00:00Z",status:"archivado",paid_at:"2026-10-30T15:00:00Z",total:50,collected:50,cashiers:[{id:"cashier-test",name:"Otra cajera QA"}],methods:["qr"],items:[{name:"Café QA",quantity:2}]}]}});
 });
 await login(page,"ADMIN","/qa-preview/employees");
 await page.getByRole("article",{name:"Atención QA",exact:true}).getByRole("button",{name:"Historial de ventas",exact:true}).click();
 const dialog=page.getByRole("dialog",{name:"Ventas de Atención QA",exact:true});
 await expect(dialog.getByText(/Cobró: Otra cajera QA/)).toBeVisible();
 await dialog.getByRole("button",{name:"Esta semana",exact:true}).click();await expect(dialog.getByLabel("Desde",{exact:true})).toHaveValue("2026-10-26");
 await dialog.getByLabel("Desde",{exact:true}).fill("2026-09-01");await dialog.getByLabel("Hasta",{exact:true}).fill("2026-09-30");await dialog.getByRole("button",{name:"Filtrar",exact:true}).click();
 await expect(page.getByTestId("employee-sales-range")).toContainText("01/09/2026 al 30/09/2026");
 await dialog.locator("summary").click();await expect(dialog.getByText("2 × Café QA",{exact:true})).toBeVisible();
 for(const viewport of [{width:1365,height:900},{width:390,height:844}]){
  await page.setViewportSize(viewport);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/admin/employee-history-${viewport.width}.png`,animations:"disabled"});
 }
 fail=true;await dialog.getByRole("button",{name:"Hoy",exact:true}).click();await expect(dialog.getByRole("alert")).toContainText("prueba");
 await dialog.getByRole("button",{name:"Reintentar",exact:true}).click();await expect(dialog.getByRole("alert")).toHaveCount(0);
 expect(calls.some(q=>q.includes("start=2026-09-01")&&q.includes("end=2026-09-30"))).toBe(true);
});
test("real admin history is protected at HTTP and database boundaries; invalid ranges are rejected",async({page})=>{
 const id="fcfe27e4-1061-4d2f-b55b-7ba2dbdf602d",url=`/api/employees/${id}/sales`;
 expect((await page.request.get(url)).status()).toBe(401);
 await login(page,"STAFF","/");expect((await page.request.get(url)).status()).toBe(403);
 await page.getByRole("button",{name:"Salir",exact:true}).click();
 await login(page);
 const response=await page.request.get(url+"?start=2031-01-01&end=2031-01-01");
 expect(response.status()).toBe(200);expect(response.headers()["cache-control"]).toContain("no-store");
 const result=await response.json();expect(result.summary.orders).toBe(0);expect(result.orders).toEqual([]);
 for(const query of ["?start=2026-02-30&end=2026-03-01","?start=2026-01-01&end=2027-01-02","?page=-1","?page=0&page=1"])expect((await page.request.get(url+query)).status()).toBe(400);
});
test("retiring and reactivating products uses soft updates and keeps them editable",async({page})=>{
 await login(page,"ADMIN","/menu-admin");
 await page.getByRole("button",{name:/^Productos del menú/}).click();
 await page.getByLabel("Buscar productos",{exact:true}).fill("Cappuccino");
 const row=page.getByRole("list",{name:"Productos del menú"}).locator("li").first(),id=await row.getAttribute("data-item-id");
 const patches:boolean[]=[];
 await page.route("**/rest/v1/menu_items**",async route=>{
  if(route.request().method()==="GET")return route.continue();
  expect(route.request().method()).toBe("PATCH");
  const body=route.request().postDataJSON();expect(Object.keys(body)).toEqual(["active"]);patches.push(body.active);
  await route.fulfill({json:{id,name:"Cappuccino",price:20,category_id:"test-category",sort_order:0,active:body.active}});
 });
 page.once("dialog",d=>d.accept());await row.getByRole("button",{name:"Retirar Cappuccino",exact:true}).click();
 await expect(row).toContainText("Retirado");await row.getByRole("button",{name:"Reactivar Cappuccino",exact:true}).click();
 await expect(row.getByRole("button",{name:"Retirar Cappuccino",exact:true})).toBeVisible();expect(patches).toEqual([false,true]);
});
test("arbitrary calendar month exports its selected data and puts the breakdown on a separate sheet with logo",async({page})=>{
 await login(page,"ADMIN","/historial?period=monthly&date=2026-10-01");
 await page.getByLabel("Mes",{exact:true}).fill("2026-09");
 await page.getByRole("button",{name:"Aplicar filtros",exact:true}).click();
 await expect(page.getByTestId("report-range")).toContainText("01/09/2026 al 30/09/2026");
 const response=await page.request.get((await page.getByRole("link",{name:"Exportar Excel",exact:true}).getAttribute("href"))!);
 expect(response.status()).toBe(200);
 const book=new ExcelJS.Workbook();await book.xlsx.load(new Uint8Array(await response.body()).buffer);
 expect(book.worksheets.map(s=>s.name)).toEqual(["Ventas","Desglose"]);
 const main=book.getWorksheet("Ventas")!,detail=book.getWorksheet("Desglose")!;
 expect(main.getCell("A6").result).toBe(reference.september.total);expect(main.getCell("B6").value).toBe(reference.september.orders);expect(main.getCell("C6").result).toBe(reference.september.units);
 expect(main.getCell("B3").value).toEqual(new Date("2026-09-01T00:00:00Z"));expect(main.getCell("C3").value).toEqual(new Date("2026-09-30T00:00:00Z"));
 expect(main.getImages()).toHaveLength(1);expect(detail.getImages()).toHaveLength(1);expect(main.getColumn(4).values).not.toContain("QR");expect(detail.getColumn(4).values).toContain("QR");
 await book.xlsx.writeFile("../outputs/admin_2026-10-30/reporte-mensual-septiembre.xlsx");
});
test("compact admin pages remain legible on desktop and mobile",async({page})=>{
 await login(page);
 for(const [path,label] of [["/empleados","Empleados"],["/promociones","Promociones"],["/perfil","Mi perfil"],["/compras-empleados","Cobros del equipo"]]){
  await page.goto(path);await expect(page.getByRole("heading",{name:label,exact:true})).toBeVisible();
  for(const viewport of [{width:1365,height:900},{width:390,height:844}]){
   await page.setViewportSize(viewport);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:`test-results/admin/${path.slice(1)}-${viewport.width}.png`,animations:"disabled",fullPage:true});
  }
 }
});


test("new product and category dialogs validate and save simulated records with cancel controls",async({page})=>{
 await login(page,"ADMIN","/menu-admin");const writes:string[]=[];
 await page.route("**/rest/v1/**",async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()==="GET"||request.method()==="HEAD")return route.continue();
  expect(request.method()).toBe("POST");writes.push(path);
  const value=request.postDataJSON();
  if(path.endsWith("/menu_items"))return route.fulfill({json:{...value,id:"00000000-0000-4000-8000-000000009100",active:true}});
  if(path.endsWith("/categories"))return route.fulfill({json:{...value,id:"00000000-0000-4000-8000-000000009101",active:true}});
  await route.abort();throw new Error("Unexpected database mutation");
 });
 await page.getByRole("button",{name:/^Nuevo producto/}).click();
 let dialog=page.getByRole("dialog",{name:"Nuevo producto",exact:true});
 await dialog.getByLabel("Nombre del producto",{exact:true}).fill("Producto nuevo QA");
 await dialog.getByLabel("Precio (Bs)",{exact:true}).fill("12,50");await dialog.getByRole("button",{name:"Crear producto",exact:true}).click();
 await expect(dialog).toHaveCount(0);
 await page.getByRole("button",{name:/^Productos del menú/}).click();
 await page.getByLabel("Buscar productos",{exact:true}).fill("Producto nuevo QA");await expect(page.getByRole("list",{name:"Productos del menú"})).toContainText("Bs 12.50");await page.keyboard.press("Escape");
 await page.getByRole("button",{name:/^Nueva categoría/}).click();dialog=page.getByRole("dialog",{name:"Categorías",exact:true});
 await dialog.getByLabel("Nombre de la categoría",{exact:true}).fill("Bebidas nuevas QA");
 await dialog.getByLabel("Preparación",{exact:true}).selectOption("cafe");await dialog.getByRole("button",{name:"Crear categoría",exact:true}).click();
 await expect(dialog.getByRole("list")).toContainText("Bebidas nuevas QA");
 await dialog.getByRole("button",{name:"Cancelar",exact:true}).click();expect(writes).toEqual(["/rest/v1/menu_items","/rest/v1/categories"]);
});
test("header refresh keeps the team's selected collection filter",async({page})=>{
 await login(page,"ADMIN","/compras-empleados");const filters:string[]=[];
 await page.route("**/rest/v1/rpc/list_employee_purchases",async route=>{
  filters.push(route.request().postDataJSON().p_state);
  await route.fulfill({json:{purchases:[],has_more:false}});
 });
 await page.getByLabel("Mostrar",{exact:false}).selectOption("paid");
 await expect.poll(()=>filters.at(-1)).toBe("paid");
 await page.getByRole("button",{name:"Actualizar página",exact:true}).click();
 await expect.poll(()=>filters.length).toBe(2);expect(filters).toEqual(["paid","paid"]);
});

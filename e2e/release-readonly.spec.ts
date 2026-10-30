import {test,expect,type Page} from "@playwright/test";
import ExcelJS from "exceljs";
import reference from "./report-reference.json";
import {isReadOnlyTestRequest} from "./safe-requests";

async function login(page:Page,role="ADMIN",next="/historial"){
 await page.goto("/login?next="+encodeURIComponent(next));
 await page.getByLabel("Correo electrónico").fill(process.env["E2E_"+role+"_EMAIL"]!);
 await page.getByLabel("Contraseña").fill(process.env["E2E_"+role+"_PASSWORD"]!);
 await page.getByRole("button",{name:"Ingresar",exact:true}).click();await expect(page).not.toHaveURL(/\/login/);
}
test.beforeEach(async({page})=>{
 await page.route("**/rest/v1/**",async route=>{if(isReadOnlyTestRequest(route.request()))return route.continue();await route.abort();throw Error("Release verification forbids business writes");});
});

test("production build excludes every QA preview and preserves real report/export reconciliation",async({page})=>{
 await login(page);
 for(const route of ["employees","orders","cashbox","employee-purchase","employee-purchase-cashier","promotions","promotion-menu"]){
  expect((await page.request.get("/qa-preview/"+route)).status(),route).toBe(404);
 }
 const response=await page.request.get("/historial/export?period=monthly&date=2026-10-01&payment=all&purchase=all");
 expect(response.status()).toBe(200);expect(response.headers()["cache-control"]).toContain("private, no-store");
 const book=new ExcelJS.Workbook();await book.xlsx.load(new Uint8Array(await response.body()).buffer);
 expect(book.worksheets.map(s=>s.name)).toEqual(["Ventas","Desglose"]);expect(book.getWorksheet("Ventas")!.getImages().length).toBe(1);
 const sheet=book.getWorksheet("Ventas")!;expect(sheet.getCell("A6").result).toBe(reference.monthly.total);expect(sheet.getCell("B6").value).toBe(reference.monthly.orders);expect(sheet.getCell("C6").result).toBe(reference.monthly.units);
 await page.goto("/historial?period=monthly&date=2026-10-01&payment=all&purchase=all");
 await expect(page.getByRole("heading",{name:"Historial y reportes",exact:true})).toBeVisible();
 await expect(page.getByTestId("summary-total")).toContainText(new Intl.NumberFormat("es-BO",{style:"currency",currency:"BOB"}).format(reference.monthly.total));
 const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
 for(const width of [1365,390]){
  await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`test-results/p15/report-${width}.png`,animations:"disabled"});
 }
 await page.goto("/empleados");await page.getByRole("button",{name:"Agregar empleado",exact:true}).click();
 await page.getByLabel("Nombre completo",{exact:true}).fill("Ána Ejemplo");await expect(page.getByLabel("Usuario de acceso",{exact:true})).toHaveValue("ana");
 await page.screenshot({path:"test-results/p15/employee-mobile.png",animations:"disabled"});
 await page.getByRole("button",{name:"Cancelar",exact:true}).click();expect(errors).toEqual([]);
});

test("production staff navigation, open-box preview and cached assets do not expose private pages",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await login(page,"STAFF","/");
 await page.getByPlaceholder("Buscar ítem...").fill("Cappuccino");await page.getByRole("button",{name:"Agregar Cappuccino",exact:true}).click();await page.getByRole("button",{name:"Ver pedido",exact:true}).click();
 await page.setViewportSize({width:320,height:844});await expect(page.getByTestId("table-shortcuts").getByRole("button")).toHaveText(["1","2","3","4","5","6","Para llevar","Otra"]);
 await page.screenshot({path:"test-results/p15/staff-320.png",animations:"disabled"});
 await page.goto("/caja");await page.getByRole("button",{name:"Abrir caja",exact:true}).click();
 await expect(page.getByLabel("Efectivo inicial para cambio (Bs)",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Cancelar",exact:true}).click();
 expect((await page.request.get("/historial/export?period=daily")).status()).toBe(403);
 const manifest=await(await page.request.get("/manifest.webmanifest")).json();expect(manifest.name).toBe("Mamita Masita");expect(manifest.icons).toHaveLength(2);
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 const privateCached=await page.evaluate(async()=>{for(const key of await caches.keys())for(const request of await(await caches.open(key)).keys())if(["/","/caja","/historial","/empleados","/pedidos"].includes(new URL(request.url).pathname))return true;return false;});
 expect(privateCached).toBe(false);
});

import {isReadOnlyTestRequest} from "./safe-requests";
import { expect,test,type Page } from "@playwright/test";
async function login(page:Page,role="ADMIN"){
  await page.goto("/login"); await page.getByLabel("Correo electrónico").fill(process.env[`E2E_${role}_EMAIL`]!);await page.getByLabel("Contraseña").fill(process.env[`E2E_${role}_PASSWORD`]!);await page.getByRole("button",{name:"Ingresar",exact:true}).click();await expect(page).not.toHaveURL(/\/login/,{timeout:15000});
}
test("P06 schedules, edits and disables a daily promotion without real writes",async({page})=>{
  let saved:any=null;const requests:any[]=[];
  await page.route("**/rest/v1/**",async route=>{
    if(new URL(route.request().url()).pathname.endsWith("/rpc/admin_save_daily_promotion")){
      const body=route.request().postDataJSON(); requests.push(body);
      saved={promotion_date:body.p_date,discount_bps:body.p_discount_bps,active:body.p_active,revision:(saved?.revision??0)+1,updated_at:"2026-10-29T20:00:00Z"};return route.fulfill({json:saved});
    }
    if(!isReadOnlyTestRequest(route.request())){await route.abort();throw new Error("Unexpected real promotion mutation");}await route.continue();
  });
  await login(page);await page.goto("/qa-preview/promotions");
  await page.getByLabel("Descuento (%)",{exact:true}).fill("15");await page.getByRole("button",{name:"Programar promoción",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("15%");
  await page.getByLabel("Descuento (%)",{exact:true}).fill("20");await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();await expect(page.getByRole("status")).toContainText("20%");
  await page.screenshot({path:"test-results/p06/promotions-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.getByLabel("Promoción activa",{exact:true}).uncheck();await page.getByRole("button",{name:"Guardar cambios",exact:true}).click();await expect(page.getByRole("status")).toContainText("desactivada");
  expect(requests.map(row=>row.p_discount_bps)).toEqual([1500,2000,2000]);expect(requests.map(row=>row.p_expected_revision)).toEqual([null,1,2]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:"test-results/p06/promotions-mobile.png",fullPage:true});
});
test("P06 stale promotion asks for review and keeps the cart instead of creating an order",async({page,context,baseURL})=>{
  let submits=0;
  await page.route("**/rest/v1/**",async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith("/rpc/place_customer_order")){
      const body=route.request().postDataJSON();expect(body.p_expected_discount_bps).toBe(1500);expect(body.p_items[0].quantity).toBe(2);expect(body.p_items[0].expected_unit_price).toBe(20);submits++;
      await context.addCookies([{name:"p06-qa-rate",value:"2000",url:baseURL!}]);return route.fulfill({status:400,json:{code:"40001",message:"La promoción cambió"}});
    }
    if(path.endsWith("/rpc/get_order_pricing_context")) return route.fulfill({json:{date:"2026-10-29",discount_bps:2000,revision:2,expires_at:"2026-10-30T04:00:00Z"}});
    if(!isReadOnlyTestRequest(route.request())){await route.abort();throw new Error("Unexpected real order write");}await route.continue();
  });
  await login(page,"STAFF");await page.goto("/qa-preview/promotion-menu");
  await page.getByPlaceholder("Buscar ítem...").fill("Cappuccino");await page.getByRole("button",{name:"Agregar Cappuccino",exact:true}).click();await page.getByRole("button",{name:"Agregar otro Cappuccino",exact:true}).click();
  const panel=page.locator("aside").filter({has:page.getByRole("button",{name:"Registrar pedido",exact:true})});
  await expect(panel).toContainText(/34[,.]00/);await page.getByRole("button",{name:"Otra",exact:true}).click();await page.getByLabel("Nro. de mesa",{exact:true}).fill("QA");
  await page.getByRole("button",{name:"Registrar pedido",exact:true}).click();
  await expect(page.getByText("El menú o la promoción cambió. Revisa el total actualizado y vuelve a confirmar.",{exact:true})).toBeVisible();await expect(panel).toContainText(/32[,.]00/);expect(submits).toBe(1);
  const noPriceOverlap=await page.getByRole("article").filter({has:page.getByRole("heading",{name:"Cappuccino",exact:true})}).evaluate(card=>{const price=card.querySelector("p")!.getBoundingClientRect();const controls=card.querySelector('button[aria-label="Disminuir Cappuccino"]')!.parentElement!.getBoundingClientRect();return price.bottom<=controls.top||controls.bottom<=price.top||price.right<=controls.left||controls.right<=price.left;});expect(noPriceOverlap).toBe(true);
  await page.screenshot({path:"test-results/p06/menu-discount-desktop.png",fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:"test-results/p06/menu-discount-mobile.png",fullPage:true});
});
test("P06 validates input without a request and restricts staff navigation",async({page})=>{
  await login(page);await page.goto("/qa-preview/promotions");await page.getByLabel("Descuento (%)",{exact:true}).fill("101");await page.getByRole("button",{name:"Programar promoción",exact:true}).click();await expect(page.locator('p[role="alert"]')).toContainText("0,01 a 100");
  await page.getByRole("button",{name:"Salir",exact:true}).click();await login(page,"STAFF");await expect(page.getByRole("link",{name:"Promos",exact:true})).toHaveCount(0);await page.goto("/promociones");await expect(page).toHaveURL("/");
});
test("P06 real module loads the server date and menu without programming a discount",async({page})=>{
  await login(page);await page.goto("/promociones");
  await expect(page.getByRole("heading",{name:"Promociones",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Programar promoción",exact:true})).toBeEnabled();
  await expect(page.getByText(/Hoy en Bolivia:/)).toBeVisible();await page.getByRole("link",{name:"Menú",exact:true}).click();await expect(page.getByRole("heading",{name:"Menú",exact:true})).toBeVisible();
  await expect(page.getByText("No se pudo verificar la promoción vigente.",{exact:true})).toHaveCount(0);
});

import {isReadOnlyTestRequest} from "./safe-requests";
import { test,expect,type Page } from "@playwright/test";
import { qaOrderId,qaOrderSnapshot,qaOrderCatalog } from "../lib/qa-order-fixture";
async function login(page:Page,next="/"){
  await page.goto(`/login?next=${encodeURIComponent(next)}`);await page.getByLabel("Correo electrónico").fill(process.env.E2E_STAFF_EMAIL!);await page.getByLabel("Contraseña").fill(process.env.E2E_STAFF_PASSWORD!);await page.getByRole("button",{name:"Ingresar",exact:true}).click();await expect(page).not.toHaveURL(/\/login/);
}
test("Compact menu uses accordions and a shared refresh, with mobile and desktop layouts",async({page})=>{
  await page.route("**/rest/v1/**",route=>["GET","HEAD"].includes(route.request().method())||route.request().url().endsWith("/rpc/get_order_pricing_context")?route.continue():route.abort());
  await page.setViewportSize({width:390,height:844});await login(page);await expect(page).toHaveTitle("Mamita Masita");await expect(page.getByRole("button",{name:"Todos",exact:true})).toHaveCount(0);await expect(page.locator("details")).toHaveCount(10);
  await expect(page.getByRole("button",{name:"Agregar Blanco",exact:true})).not.toBeVisible();await page.locator("summary").filter({hasText:"Vitrina pan"}).click();await expect(page.getByRole("button",{name:"Agregar Blanco",exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({animations:"disabled",path:"test-results/compact/menu-mobile.png"});
  await page.getByRole("button",{name:"Agregar Blanco",exact:true}).click();await page.getByRole("button",{name:"Ver pedido",exact:true}).click();await page.getByRole("button",{name:"Otra",exact:true}).click();await page.getByLabel("Nro. de mesa",{exact:true}).fill("6.1");await page.screenshot({animations:"disabled",path:"test-results/compact/cart-mobile.png"});await page.getByRole("button",{name:"Volver al menú",exact:true}).click();
  await page.setViewportSize({width:1365,height:900});await page.getByRole("button",{name:"Agregar otro Blanco",exact:true}).click();await page.screenshot({animations:"disabled",path:"test-results/compact/menu-desktop.png"});
});
for(const service of ["table","takeaway"])test(`Customer ${service} placement sends the correct collection rule and retains the request ID on retry`,async({page})=>{
  const requests:any[]=[];let first=true;
  await page.route("**/rest/v1/**",route=>{
    if(route.request().url().endsWith("/rpc/place_customer_order")){requests.push(route.request().postDataJSON());if(first){first=false;return route.abort();}return route.fulfill({json:{order_id:qaOrderId}});}
    if(route.request().url().endsWith("/rpc/get_order_pricing_context")||["GET","HEAD"].includes(route.request().method()))return route.continue();return route.abort();
  });
  await page.setViewportSize({width:390,height:844});await login(page);await page.getByPlaceholder("Buscar ítem...").fill("Cappuccino");await page.getByRole("button",{name:"Agregar Cappuccino",exact:true}).click();await page.getByRole("button",{name:"Ver pedido",exact:true}).click();
  if(service==="takeaway"){await page.getByRole("button",{name:"Para llevar",exact:true}).click();await page.getByRole("button",{name:"QR",exact:true}).click();}else{await page.getByRole("button",{name:"Otra",exact:true}).click();await page.getByLabel("Nro. de mesa",{exact:true}).fill("6.1");await expect(page.getByRole("group",{name:"Medio de pago",exact:true})).toHaveCount(0);}
  const submit=page.getByRole("button",{name:service==="takeaway"?"Cobrar y registrar":"Registrar pedido",exact:true});await submit.click();await expect(page.getByRole("alert")).toBeVisible();await submit.click();await expect(page).toHaveURL("/pedidos");expect(requests).toHaveLength(2);expect(requests[0].p_service).toBe(service);expect(requests[0].p_method).toBe(service==="takeaway"?"qr":null);expect(requests[1].p_request_id).toBe(requests[0].p_request_id);expect(requests[0].p_table_number).toBe(service==="takeaway"?"Para llevar":"6.1");
});
test("Closed defaults to today, supports an empty date and explicit historical access",async({page})=>{
  await login(page,"/pedidos?view=closed");await expect(page.getByLabel("Fecha de pedidos cerrados")).toBeVisible();const current=await(await page.request.get("/api/orders/live?view=closed")).json();expect(current.closed_filter.all_dates).toBe(false);
  await page.getByLabel("Fecha de pedidos cerrados").fill("2031-01-01");await page.getByRole("button",{name:"Filtrar",exact:true}).click();await expect(page.locator("article[data-order-id]")).toHaveCount(0);
  await page.getByRole("checkbox",{name:"Todo el historial",exact:true}).check();await page.getByRole("button",{name:"Filtrar",exact:true}).click();await expect(page.locator("article[data-order-id]")).toHaveCount(24);expect((await page.request.get("/api/orders/live?view=closed&date=2026-02-30")).status()).toBe(400);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({animations:"disabled",path:"test-results/compact/closed-mobile.png"});
});
test("Prepaid editor requires acknowledgement and tender for collections/refunds and never calls legacy checkout",async({page})=>{
  const snapshot=qaOrderSnapshot();snapshot.order.paid_at="2026-10-29T12:00:01Z";snapshot.order.payment_method="cash";snapshot.order.payment_methods=["cash"];snapshot.order.table_number="Para llevar";const adjustments:any[]=[];
  await page.route("**/rest/v1/**",async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith("/rpc/get_order_edit_snapshot"))return route.fulfill({json:snapshot});
    if(path.endsWith("/order_items"))return route.fulfill({json:snapshot.items});
    if(path.endsWith("/rpc/edit_prepaid_order")){
      const body=route.request().postDataJSON();adjustments.push(body);const change=body.p_changes[0];if(change.action==="add"){const p=qaOrderCatalog[2];snapshot.items.push({id:"00000000-0000-4000-8000-000000002003",order_id:qaOrderId,menu_item_id:p.id,item_name:p.name,category_name:"Café",quantity:1,unit_price:20,line_total:20,net_total:20,status:"pending"});snapshot.order.total=79;}else{snapshot.items.find(i=>i.id===change.order_item_id)!.status="voided";snapshot.order.total=30;}snapshot.order.revision++;snapshot.order.payment_methods=["cash","qr"];return route.fulfill({json:snapshot});
    }
    if(!isReadOnlyTestRequest(route.request()))return route.abort();return route.continue();
  });
  await login(page);await page.goto("/qa-preview/orders?prepaid=1");await page.locator("article").getByRole("heading").click();await page.getByRole("button",{name:"Editar pedido",exact:true}).click();await page.getByRole("button",{name:"Agregar Cappuccino QA",exact:true}).click();const save=page.getByRole("button",{name:"Guardar cambios",exact:true});await expect(save).toBeDisabled();await page.getByRole("group",{name:"Medio del ajuste",exact:true}).getByRole("button",{name:"QR",exact:true}).click();await page.getByRole("checkbox",{name:"Confirmo que recibí la diferencia"}).check();await save.click();await expect(page.getByRole("region",{name:"Editar pedido",exact:true})).toHaveCount(0);expect(adjustments[0].p_expected_delta).toBe(20);expect(adjustments[0].p_method).toBe("qr");
  await page.getByRole("button",{name:"Editar pedido",exact:true}).click();await page.getByRole("button",{name:"Quitar Focaccia QA",exact:true}).click();await expect(save).toBeDisabled();await page.getByRole("group",{name:"Medio del ajuste",exact:true}).getByRole("button",{name:"Efectivo",exact:true}).click();await page.getByRole("checkbox",{name:"Confirmo que devolví la diferencia"}).check();await page.setViewportSize({width:390,height:844});await page.screenshot({animations:"disabled",path:"test-results/compact/refund-mobile.png"});await save.click();await expect(page.getByRole("region",{name:"Editar pedido",exact:true})).toHaveCount(0);expect(adjustments[1].p_expected_delta).toBe(-49);
});

import{test,expect,type Page}from"@playwright/test";
import{qaEmployeePurchase}from"../lib/qa-purchase-fixture";
async function login(page:Page,role="COOK"){await page.goto("/login");await page.getByLabel("Correo electrónico").fill(process.env[`E2E_${role}_EMAIL`]!);await page.getByLabel("Contraseña").fill(process.env[`E2E_${role}_PASSWORD`]!);await page.getByRole("button",{name:"Ingresar",exact:true}).click();await expect(page).not.toHaveURL(/\/login/,{timeout:15000});}
test("P07 employee sends a Bs 59 purchase for 47.20 and retries with the same request ID",async({page})=>{
 const ids:string[]=[];
 await page.route("**/rest/v1/**",async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith("/rpc/create_employee_purchase")){const body=route.request().postDataJSON();expect(body.p_buyer_employee_id).toBeUndefined();expect(body.p_discount_bps).toBeUndefined();ids.push(body.p_request_id);if(ids.length===1)return route.fulfill({status:503,json:{message:"No se pudo confirmar el resultado. Reintenta."}});return route.fulfill({json:qaEmployeePurchase()});}
  if(!["GET","HEAD"].includes(route.request().method())){await route.abort();throw new Error("Unexpected real purchase mutation");}await route.continue();
 });
 await login(page);await page.goto("/qa-preview/employee-purchase");await page.getByRole("button",{name:"Agregar Espresso QA",exact:true}).click();await page.getByRole("button",{name:"Agregar Focaccia QA",exact:true}).click();
 const cart=page.locator("#resumen-compra");await expect(cart).toContainText(/47[,.]20/);await expect(cart).toContainText(/11[,.]80/);
 await page.getByRole("button",{name:"Enviar compra a cobro",exact:true}).click();await expect(page.getByRole("alert").filter({hasText:"Reintenta"})).toBeVisible();
 await page.getByRole("button",{name:"Enviar compra a cobro",exact:true}).click();await expect(page.getByRole("status")).toContainText("Aún no está cobrada");expect(ids).toHaveLength(2);expect(ids[0]).toBe(ids[1]);
 await page.getByRole("button",{name:"Agregar Espresso QA",exact:true}).click();await page.getByRole("button",{name:"Agregar Focaccia QA",exact:true}).click();
 await page.screenshot({path:"test-results/p07/purchase-desktop.png",fullPage:true,animations:"disabled"});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:"test-results/p07/purchase-mobile.png",fullPage:true,animations:"disabled"});
});
test("P07 cashier confirms actual QR receipt while the buyer cannot access team checkout",async({page})=>{
 let payments=0;
 await page.route("**/rest/v1/**",async route=>{const path=new URL(route.request().url()).pathname;if(path.endsWith("/rpc/checkout_employee_purchase")){const body=route.request().postDataJSON();expect(body.p_payment_method).toBe("qr");expect(body.p_expected_revision).toBe(0);payments++;const snapshot=qaEmployeePurchase();snapshot.order.status="archivado";snapshot.order.paid_at="2026-10-29T12:30:00Z";snapshot.order.payment_method="qr";return route.fulfill({json:snapshot});}if(!["GET","HEAD"].includes(route.request().method())){await route.abort();throw new Error("Unexpected real checkout");}await route.continue();});
 await login(page,"STAFF");await page.goto("/qa-preview/employee-purchase-cashier");await page.getByRole("button",{name:"QR",exact:true}).click();await page.getByRole("button",{name:"Confirmar cobro y entrega",exact:true}).click();expect(payments).toBe(1);await expect(page.getByRole("button",{name:"Confirmar cobro y entrega",exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Salir",exact:true}).click();await login(page,"BARISTA");await page.goto("/compras-empleados");await expect(page).toHaveURL("/cafe");
});

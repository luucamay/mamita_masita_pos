import {test,expect,type Page} from "@playwright/test";
import {isReadOnlyTestRequest} from "./safe-requests";
import {qaOrderId,qaOrderSnapshot} from "../lib/qa-order-fixture";
import {qaEmployeePurchase} from "../lib/qa-purchase-fixture";
async function login(page:Page,next:string){await page.goto('/login');await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL!);await page.getByLabel('Contraseña').fill(process.env.E2E_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).not.toHaveURL(/\/login/);const ready=page.waitForResponse(response=>response.url().endsWith('/api/auth/access')&&response.status()===200);await page.goto(next);await ready;}
test.beforeEach(async({page})=>{await page.route('**/rest/v1/**',route=>isReadOnlyTestRequest(route.request())?route.continue():route.abort());});

test('Table pay always opens the optional note before confirming; retry keeps the same observation',async({page})=>{
 const attempts:unknown[]=[];
 await page.route('**/rest/v1/rpc/checkout_order_with_observation',route=>{attempts.push(route.request().postDataJSON());return attempts.length===1?route.fulfill({status:503,json:{message:'Resultado no confirmado. Reintenta.'}}):route.fulfill({json:[{payment_id:'qa',order_id:qaOrderId,status:'archivado'}]});});
 await page.route('**/rest/v1/order_items?*',route=>route.fulfill({json:qaOrderSnapshot().items}));
 await page.setViewportSize({width:390,height:844});await login(page,'/qa-preview/orders?delivered=1');
 await page.locator('article').getByRole('button',{name:'Pagar',exact:true}).click();
 const field=page.getByLabel('Observación del cobro');await expect(field).toBeVisible();await expect(field).toHaveAttribute('maxlength','500');await field.fill('Cappuccino sustituido con autorización de la encargada.');
 await page.getByRole('button',{name:'QR',exact:true}).click();expect(attempts.length).toBe(0);
 await page.getByRole('dialog').getByRole('button',{name:'Pagar',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/payment-observations/payment-mobile.png',animations:'disabled'});
 await page.getByRole('button',{name:'Pagar',exact:true}).last().click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Resultado no confirmado. Reintenta.');await expect(field).toHaveValue('Cappuccino sustituido con autorización de la encargada.');
 await page.setViewportSize({width:1365,height:900});await page.screenshot({path:'test-results/payment-observations/payment-desktop.png',animations:'disabled'});await page.getByRole('button',{name:'Pagar',exact:true}).last().click();
 await expect.poll(()=>attempts.length).toBe(2);expect(attempts[1]).toEqual(attempts[0]);expect((attempts[0] as any).p_observation).toContain('Cappuccino');await expect(field).toHaveCount(0);
});

test('Takeaway observation travels in the atomic placement request and survives a network retry',async({page})=>{
 const bodies:any[]=[];await page.route('**/rest/v1/rpc/place_customer_order_with_observation',route=>{bodies.push(route.request().postDataJSON());return bodies.length===1?route.abort():route.fulfill({json:{order_id:qaOrderId}});});
 await page.setViewportSize({width:390,height:844});await login(page,'/menu');await page.getByPlaceholder('Buscar ítem...').fill('Cappuccino');await page.getByRole('button',{name:'Agregar Cappuccino',exact:true}).click();await page.getByRole('button',{name:'Ver pedido',exact:true}).click();await page.getByRole('button',{name:'Para llevar',exact:true}).click();await page.getByLabel('Observación del cobro').fill('Promoción autorizada.');await page.getByRole('button',{name:'QR',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/payment-observations/takeaway-mobile.png',animations:'disabled'});
 await page.getByRole('button',{name:'Cobrar y registrar',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await page.getByRole('button',{name:'Cobrar y registrar',exact:true}).click();await expect(page).toHaveURL('/pedidos');expect(bodies[1]).toEqual(bodies[0]);expect(bodies[0].p_observation).toBe('Promoción autorizada.');
});

test('The note is optional and a canceled draft is cleared before the next checkout',async({page})=>{
 let paid:any;
 await page.route('**/rest/v1/rpc/checkout_order',route=>{paid=route.request().postDataJSON();return route.fulfill({json:[{payment_id:'qa',order_id:qaOrderId,status:'archivado'}]});});
 await page.route('**/rest/v1/order_items?*',route=>route.fulfill({json:qaOrderSnapshot().items}));
 await login(page,'/qa-preview/orders?delivered=1');const pay=()=>page.locator('article').getByRole('button',{name:'Pagar',exact:true});
 await pay().click();await page.getByLabel('Observación del cobro').fill('Borrador descartado');await page.getByRole('button',{name:'Cerrar detalle'}).click();await pay().click();await expect(page.getByLabel('Observación del cobro')).toHaveValue('');
 await page.getByRole('button',{name:'Efectivo',exact:true}).click();await page.getByRole('button',{name:'Pagar',exact:true}).last().click();await expect.poll(()=>paid?.p_payment_method).toBe('cash');expect(paid.p_observation).toBeUndefined();await expect(page.getByLabel('Observación del cobro')).toHaveCount(0);
});

test('Employee collection and prepaid refund send notes without bypassing tender confirmation',async({page})=>{
 let employee:any,adjustment:any;const snapshot=qaOrderSnapshot();snapshot.order.paid_at='2026-10-29T12:00:01Z';snapshot.order.payment_methods=['cash'];snapshot.order.payment_method='cash';
 await page.route('**/rest/v1/rpc/checkout_employee_purchase_with_observation',route=>{employee=route.request().postDataJSON();const paid=qaEmployeePurchase();paid.order.status='archivado';paid.order.paid_at='2026-10-29T12:30:00Z';paid.order.payment_method='qr';return route.fulfill({json:paid});});
 await page.route('**/rest/v1/rpc/get_order_edit_snapshot',route=>route.fulfill({json:snapshot}));await page.route('**/rest/v1/order_items?*',route=>route.fulfill({json:snapshot.items}));
 await page.route('**/rest/v1/rpc/edit_prepaid_order_with_observation',route=>{adjustment=route.request().postDataJSON();return route.fulfill({json:snapshot});});
 await login(page,'/qa-preview/employee-purchase-cashier');await page.getByLabel('Observación del cobro').fill('Compra personal autorizada.');await page.getByRole('button',{name:'QR',exact:true}).click();await page.getByRole('button',{name:'Confirmar cobro y entrega',exact:true}).click();expect(employee.p_observation).toBe('Compra personal autorizada.');
 await page.goto('/qa-preview/orders?prepaid=1');await page.locator('article').getByRole('heading').click();await page.getByRole('button',{name:'Editar pedido',exact:true}).click();await page.getByRole('button',{name:'Quitar Focaccia QA',exact:true}).click();await page.getByLabel('Observación del cobro').fill('Devolución por cambio de producto.');const save=page.getByRole('button',{name:'Guardar cambios',exact:true});await expect(save).toBeDisabled();await page.getByRole('group',{name:'Medio del ajuste'}).getByRole('button',{name:'Efectivo',exact:true}).click();await page.getByRole('checkbox',{name:'Confirmo que devolví la diferencia'}).check();await save.click();expect(adjustment.p_observation).toBe('Devolución por cambio de producto.');expect(adjustment.p_expected_delta).toBe(-49);
});

test('Receipt and closing observations are legible in the cash history without interpreting HTML',async({page})=>{
 await login(page,'/qa-preview/payment-observations');await expect(page.getByText('QR no recibido: revisar con la dueña.')).toBeVisible();await expect(page.getByText('Observaciones de cobros (1)')).toBeVisible();
 await page.locator('summary').filter({hasText:'Ver cierre'}).click();await expect(page.getByText('<script>no ejecutar</script> · Producto sustituido por la promoción',{exact:false}).first()).toBeVisible();expect(await page.locator('script').filter({hasText:'no ejecutar'}).count()).toBe(0);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/payment-observations/cash-mobile.png',animations:'disabled'});await page.getByText('QR no recibido: revisar con la dueña.').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/payment-observations/closing-mobile.png',animations:'disabled'});
});

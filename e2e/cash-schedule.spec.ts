import {test,expect,type Page} from "@playwright/test";
import {qaScheduledCashContext} from "../lib/qa-cashbox-fixture";
import {isReadOnlyTestRequest} from "./safe-requests";
async function login(page:Page,next:string){await page.goto('/login');await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL!);await page.getByLabel('Contraseña').fill(process.env.E2E_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).not.toHaveURL(/\/login/);const ready=page.waitForResponse(r=>r.url().endsWith('/api/auth/access')&&r.status()===200);await page.goto(next);await ready;}
test.beforeEach(async({page})=>{await page.route('**/rest/v1/**',route=>isReadOnlyTestRequest(route.request())?route.continue():route.abort());});

test('The menu requires manual opening, then enables registration when a shared shift is received',async({page})=>{
 let c=qaScheduledCashContext('closed');await page.route('**/rest/v1/rpc/get_cashbox_context',route=>route.fulfill({json:c}));
 await page.setViewportSize({width:390,height:844});await login(page,'/menu');await expect(page.getByRole('link',{name:'Abrir caja',exact:true})).toBeVisible();await page.getByPlaceholder('Buscar ítem...').fill('Cappuccino');await page.getByRole('button',{name:'Agregar Cappuccino',exact:true}).click();await page.getByRole('button',{name:'Ver pedido',exact:true}).click();await page.getByRole('button',{name:'1',exact:true}).click();await expect(page.getByRole('button',{name:'Registrar pedido',exact:true})).toBeDisabled();await expect(page.getByRole('link',{name:'Ir a Caja y turnos',exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/cash-schedule/menu-before-opening-mobile.png',animations:'disabled'});c=qaScheduledCashContext();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('button',{name:'Registrar pedido',exact:true})).toBeEnabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('Reminder is visible at 13:56, can be postponed and the deadline still requires manual close',async({page})=>{
 let c=qaScheduledCashContext('warning');await page.route('**/rest/v1/rpc/get_cashbox_context',route=>route.fulfill({json:c}));
 await page.setViewportSize({width:390,height:844});await login(page,'/menu');await expect(page.getByText(/El turno termina en menos de 5 minutos/)).toBeVisible();await page.screenshot({path:'test-results/cash-schedule/reminder-mobile.png',animations:'disabled'});await page.getByRole('button',{name:'Recordar en 5 min'}).click();await expect(page.getByRole('button',{name:'Recordar en 5 min'})).toHaveCount(0);
 c=qaScheduledCashContext('expired');await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByText('Terminó el horario del turno. Cierra y entrega la caja antes de continuar.',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Ir al cierre',exact:true})).toBeVisible();expect(c.shift?.status).toBe('open');
 await page.setViewportSize({width:1365,height:900});await page.screenshot({path:'test-results/cash-schedule/expired-desktop.png',animations:'disabled'});
});

test('Cashbox shows slot, hours and initial amount; closing stays explicit after expiry',async({page})=>{
 const c=qaScheduledCashContext('expired');await page.route('**/rest/v1/rpc/get_cashbox_context',route=>route.fulfill({json:c}));
 await page.setViewportSize({width:390,height:844});await login(page,'/qa-preview/cashbox?schedule=expired');await expect(page.getByRole('heading',{name:'Mañana · Ana QA',exact:true})).toBeVisible();await expect(page.getByText('10:00–14:00',{exact:true})).toBeVisible();await expect(page.getByText(/Inicial:\s*Bs\s*100/)).toBeVisible();await expect(page.getByRole('button',{name:'Cerrar y entregar caja',exact:true})).toBeVisible();await page.screenshot({path:'test-results/cash-schedule/cashbox-mobile.png',animations:'disabled'});
 await page.getByRole('button',{name:'Cerrar y entregar caja',exact:true}).click();await expect(page.getByRole('button',{name:'Confirmar cierre y entrega'})).toBeDisabled();await page.getByRole('button',{name:'Cancelar',exact:true}).click();
});

test('Device wall clock cannot bypass a server-expired shift',async({page})=>{
 await page.addInitScript(()=>{Date.now=()=>new Date('2000-01-01T00:00:00Z').getTime();});const c=qaScheduledCashContext('expired');await page.route('**/rest/v1/rpc/get_cashbox_context',route=>route.fulfill({json:c}));await login(page,'/menu');await expect(page.getByText('Terminó el horario del turno. Cierra y entrega la caja antes de continuar.',{exact:true})).toBeVisible();
});

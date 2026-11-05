import {test,expect,type Page} from '@playwright/test';
import {qaScheduledCashContext,qaCashHistory} from '../lib/qa-cashbox-fixture';
import {isReadOnlyTestRequest} from './safe-requests';
const actor=process.env.TEMPORARY_QA_USER_ID!;
async function login(page:Page){await page.goto('/login?next=%2Fcaja');await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL!);await page.getByLabel('Contraseña').fill(process.env.E2E_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).not.toHaveURL(/\/login/);}
test.beforeEach(async({page})=>{await page.route('**/rest/v1/**',r=>isReadOnlyTestRequest(r.request())?r.continue():r.abort());await page.route('**/rest/v1/rpc/list_cashbox_shifts',r=>r.fulfill({json:qaCashHistory()}));});
test('Opening the new day fixes the initial at zero and sends no previous-day shift',async({page})=>{
 const c=qaScheduledCashContext('closed',actor);c.day_closed=false;c.summary={cash:0,qr:0,other:0,receipts:0,expected_cash:0};
 await page.route('**/rest/v1/rpc/get_cashbox_context',r=>r.fulfill({json:c}));
 let writes=0;await page.route('**/rest/v1/rpc/open_cashbox_shift',r=>{writes++;const args=r.request().postDataJSON();expect(args.p_cash).toBe('0.00');expect(args.p_previous_shift).toBeNull();const shift=qaScheduledCashContext('open',actor).shift!;shift.opening_cash=0;c.shift=shift;return r.fulfill({json:shift});});
 await login(page);await expect(page.getByRole('heading',{name:'Sin turno abierto',exact:true})).toBeVisible();await page.getByRole('button',{name:'Abrir caja',exact:true}).click();
 const d=page.getByRole('dialog',{name:'Abrir caja',exact:true}),initial=d.getByLabel('Saldo inicial del día (Bs)',{exact:true});await expect(initial).toHaveValue('0');await expect(initial).toHaveAttribute('readonly','');await expect(d.getByRole('button',{name:'Confirmar apertura'})).toBeDisabled();
 for(const width of [1365,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/zero-day/open-${width}.png`,animations:'disabled'});}
 await d.getByRole('checkbox').check();await d.getByRole('button',{name:'Confirmar apertura'}).click();await expect(d).toHaveCount(0);expect(writes).toBe(1);await expect(page.getByRole('region',{name:'Turno actual'})).toContainText(/Inicial:\s*Bs\s*0[,.]00/);
});
test('The afternoon close ends the day and leaves no receipt/open action for that same day',async({page})=>{
 const c=qaScheduledCashContext('open',actor);c.shift!.shift_slot='afternoon';c.shift!.opening_cash=18;c.summary={cash:142,qr:20,other:0,receipts:2,expected_cash:160};
 await page.route('**/rest/v1/rpc/get_cashbox_context',r=>r.fulfill({json:c}));
 await page.route('**/rest/v1/rpc/close_cashbox_shift',r=>{const args=r.request().postDataJSON();expect(args.p_counted).toBe('160.00');expect(args.p_withdrawal).toBe('0.00');const saved={...c.shift!,status:'awaiting_receipt',is_day_closed:true,closed_at:c.server_time,closed_by:actor,cash_net:142,qr_net:20,counted_cash:160,cash_left:160,difference:0};c.day_closed=true;c.shift=null;c.summary={cash:0,qr:0,other:0,receipts:0,expected_cash:0};return r.fulfill({json:saved});});
 await login(page);await expect(page.getByRole('region',{name:'Turno actual'})).toContainText('Bs 160');await page.getByRole('button',{name:'Cerrar y entregar caja',exact:true}).click();const d=page.getByRole('dialog',{name:'Cerrar y entregar caja',exact:true});await expect(d).toContainText('Este cierre termina el día.');await d.getByLabel('Efectivo contado (Bs)',{exact:true}).fill('160');await d.getByRole('checkbox').check();await page.setViewportSize({width:390,height:900});await page.screenshot({path:'test-results/zero-day/closing-day-mobile.png',animations:'disabled'});await d.getByRole('button',{name:'Confirmar cierre y entrega'}).click();
 await expect(page.getByRole('heading',{name:'Día cerrado',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Abrir caja',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Recibir caja e iniciar turno',exact:true})).toHaveCount(0);await page.screenshot({path:'test-results/zero-day/closed-day-mobile.png',animations:'disabled'});
});

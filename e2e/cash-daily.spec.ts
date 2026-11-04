import {test,expect,type Page} from '@playwright/test';
import {qaScheduledCashContext,qaCashHistory} from '../lib/qa-cashbox-fixture';
import {isReadOnlyTestRequest} from './safe-requests';
const actor=process.env.TEMPORARY_QA_USER_ID!;
const zero=()=>({date:'2026-11-04',today:'2026-11-04',summary:{cash:0,qr:0,other:0,total:0,receipts:0},shifts:[{slot:'morning',label:'Mañana',cash:0,qr:0,other:0,total:0,receipts:0},{slot:'afternoon',label:'Tarde',cash:0,qr:0,other:0,total:0,receipts:0}]});
async function login(page:Page){await page.goto('/login?next=%2Fcaja');await page.getByLabel('Correo electrónico').fill(process.env.E2E_ADMIN_EMAIL!);await page.getByLabel('Contraseña').fill(process.env.E2E_ADMIN_PASSWORD!);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).not.toHaveURL(/\/login/);}
test.beforeEach(async({page})=>{await page.route('**/rest/v1/**',route=>isReadOnlyTestRequest(route.request())?route.continue():route.abort());});
test('A new day shows zero sales separately from carried cash; closure shows cash, QR and total',async({page})=>{
 const context=qaScheduledCashContext('open',actor);context.server_time='2026-11-04T17:00:00Z';context.shift!.opened_at='2026-11-04T14:00:00Z';context.shift!.scheduled_start_at='2026-11-04T14:00:00Z';context.shift!.scheduled_end_at='2026-11-04T18:00:00Z';Object.assign(context.schedule!,{date:'2026-11-04',starts_at:'2026-11-04T14:00:00Z',ends_at:'2026-11-04T18:00:00Z'});context.shift!.opening_cash=1004.6;context.summary={cash:0,qr:0,other:0,receipts:0,expected_cash:1004.6};context.receipts=[];
 await page.route('**/rest/v1/rpc/get_cashbox_context',r=>r.fulfill({json:context}));await page.route('**/rest/v1/rpc/list_cashbox_shifts',r=>r.fulfill({json:qaCashHistory()}));
 await page.route('**/rest/v1/rpc/get_cashbox_daily_summary',r=>r.fulfill({json:zero()}));
 await login(page);
 const current=page.getByRole('region',{name:'Turno actual'});
 await expect(page.getByTestId('daily-total')).toContainText(/0[,.]00/);await expect(current).toContainText(/1[.\s]?004[,.]60/);
 await expect(current.locator('dl > div').filter({has:page.locator('dt',{hasText:'Efectivo del turno'})}).locator('dd')).toHaveText(/Bs\s*0[,.]00/);
 for(const width of [1365,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/cash-daily/new-day-${width}.png`,animations:'disabled',fullPage:true});}
 context.summary={cash:236,qr:573,other:0,receipts:2,expected_cash:1240.6};await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('region',{name:'Turno actual'})).toContainText('Bs 809');
 await page.getByRole('button',{name:'Cerrar y entregar caja',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Cerrar y entregar caja'});await expect(dialog).toContainText('Ventas QR');await expect(dialog).toContainText('Bs 573');await expect(dialog).toContainText('Bs 809');await page.screenshot({path:'test-results/cash-daily/close-mobile.png',animations:'disabled'});await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
});
test('Daily selector sums morning/afternoon and returns to today without mixing cash openings',async({page})=>{
 let fail=false,today='2026-11-04';const calls:(string|null)[]=[];
 await page.route('**/rest/v1/rpc/get_cashbox_daily_summary',r=>{
  const date=r.request().postDataJSON().p_date;calls.push(date);if(fail){fail=false;return r.fulfill({status:503,json:{message:'Servicio no disponible'}});}
  const data=zero();data.today=today;data.date=date??today;if(date==='2026-11-03'){data.shifts[0]={slot:'morning',label:'Mañana',cash:236,qr:573,other:0,total:809,receipts:2};data.shifts[1]={slot:'afternoon',label:'Tarde',cash:664,qr:270,other:0,total:934,receipts:2};data.summary={cash:900,qr:843,other:0,total:1743,receipts:4};}return r.fulfill({json:data});
 });
 await login(page);const region=page.getByRole('region',{name:'Ventas del día'});await expect(region.getByTestId('daily-total')).toContainText('Bs 0');await region.getByLabel('Fecha de ventas de caja').fill('2026-11-03');await region.getByRole('button',{name:'Ver',exact:true}).click();await expect(region.getByTestId('daily-cash')).toContainText('Bs 900');await expect(region.getByTestId('daily-qr')).toContainText('Bs 843');await expect(region.getByTestId('daily-total')).toContainText(/1[.\s]?743/);
 for(const width of [1365,390]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/cash-daily/day-total-${width}.png`,animations:'disabled',fullPage:true});}
 fail=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(region.getByRole('alert')).toBeVisible();await expect(region.getByTestId('daily-qr')).toContainText('Bs 843');await region.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(region.getByRole('alert')).toHaveCount(0);expect(calls.at(-1)).toBe('2026-11-03');await region.getByRole('button',{name:'Hoy',exact:true}).click();await expect(region.getByTestId('daily-total')).toContainText('Bs 0');expect(calls.at(-1)).toBeNull();today='2026-11-05';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(region.getByLabel('Fecha de ventas de caja')).toHaveValue(today);await expect(region.getByTestId('daily-total')).toContainText('Bs 0');
});

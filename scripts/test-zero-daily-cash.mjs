import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export function testZeroDailyCash({query,read,as,denied,check,id,espresso,apply,applyMorningGrace}){
 const fingerprint = () => read("select md5(string_agg(to_jsonb(s)::text,'' order by id)) from public.cash_shifts s");
 const original = fingerprint();
 apply();
 check('Day lifecycle migration preserves every prior financial closing field',()=>assert.equal(read("select md5(string_agg((to_jsonb(s)-'is_day_closed')::text,'' order by id)) from public.cash_shifts s"),original));
 // Only the disposable database: move previous fixtures away from today's cycle.
 query("update public.cash_shifts set opened_at=opened_at-interval '40 years',closed_at=closed_at-interval '40 years',received_at=received_at-interval '40 years',is_day_closed=true where status<>'open'");
 const schedule=read("select pg_get_functiondef('private.cash_schedule(timestamptz)'::regprocedure)");
 const forced=schedule.replace("'in_hours',p_at>=starts_at and p_at<ends_at","'in_hours',true");assert.notEqual(forced,schedule);query(forced);
 const yesterday=randomUUID();query(`insert into public.cash_shifts(id,cashier_id,opened_at,opening_cash,status,closed_at,closed_by,counted_cash,cash_left,difference) values('${yesterday}','${id.staff}',clock_timestamp()-interval '1 day',460,'awaiting_receipt',clock_timestamp()-interval '1 day','${id.staff}',460,460,0)`);
 const open=(cash,previous='null',who='staff',key=randomUUID())=>JSON.parse(as(who,`select public.open_cashbox_shift('${key}',${cash},${previous},'Prueba de ciclo diario')`));
 const context=(who='admin')=>JSON.parse(as(who,'select public.get_cashbox_context()'));
 let morning,afternoon;
 check('Yesterday pending balance is hidden and a new day rejects nonzero opening even through the API',()=>{
  assert.equal(context().shift,null);assert.equal(context().summary.expected_cash,0);denied('staff',`select public.open_cashbox_shift('${randomUUID()}',460,'${yesterday}')`,'22023');
  const key=randomUUID();morning=open(0,`'${yesterday}'`,'staff',key);assert.equal(Number(morning.opening_cash),0);assert.equal(morning.previous_shift_id,null);assert.equal(read(`select is_day_closed from public.cash_shifts where id='${yesterday}'`),'t');assert.equal(open(0,`'${yesterday}'`,'staff',key).id,morning.id);
 });
 const allowReceipts=shift=>query(`update public.cash_shifts set scheduled_start_at=clock_timestamp()-interval '1 hour',scheduled_end_at=clock_timestamp()+interval '1 hour' where id='${shift}'`);
 function sale(who,method){const quote=JSON.parse(as(who,'select public.get_order_pricing_context()'));const items=JSON.stringify([{menu_item_id:espresso,quantity:1,expected_unit_price:10}]);return JSON.parse(as(who,`select public.place_customer_order('takeaway','Para llevar','Ciclo diario QA','${items}','${quote.date}',${quote.revision},0,'${method}','${randomUUID()}')`));}
 query(`update public.cash_shifts set shift_slot='morning' where id='${morning.id}'`);allowReceipts(morning.id);sale('staff','cash');
 check('Morning handover retains only today cash and can be received by the afternoon cashier',()=>{
  const c=context();assert.equal(c.summary.cash,10);const closed=JSON.parse(as('staff',`select public.close_cashbox_shift('${randomUUID()}','${morning.id}','${c.digest}',10)`));assert.equal(closed.is_day_closed,false);
  afternoon=open(10,`'${morning.id}'`,'admin');assert.equal(Number(afternoon.opening_cash),10);assert.equal(afternoon.previous_shift_id,morning.id);
 });
 query(`update public.cash_shifts set shift_slot='afternoon' where id='${afternoon.id}'`);allowReceipts(afternoon.id);sale('admin','qr');
 check('Final turn archives the day even when no physical withdrawal was recorded and cannot be reopened that day',()=>{
  const c=context(),closed=JSON.parse(as('admin',`select public.close_cashbox_shift('${randomUUID()}','${afternoon.id}','${c.digest}',10)`));assert.equal(closed.is_day_closed,true);assert.equal(Number(closed.cash_left),10);
  const next=context();assert.equal(next.day_closed,true);assert.equal(next.shift,null);assert.equal(next.summary.expected_cash,0);denied('staff',`select public.open_cashbox_shift('${randomUUID()}',0)`,'55000');
  const report=JSON.parse(as('admin','select public.get_cashbox_daily_summary()'));assert.equal(report.summary.cash,10);assert.equal(report.summary.qr,10);assert.equal(report.summary.total,20);
 });
 query(`update public.cash_shifts set opened_at=opened_at-interval '1 day',closed_at=closed_at-interval '1 day' where id in('${morning.id}','${afternoon.id}')`);
 check('The following day starts at zero despite previous cash left; no history or money is carried over',()=>{
  const before=read(`select to_jsonb(s) from public.cash_shifts s where id='${afternoon.id}'`);const next=open(0);assert.equal(next.previous_shift_id,null);assert.equal(Number(next.opening_cash),0);assert.equal(context().day_closed,false);assert.equal(context().summary.expected_cash,0);assert.equal(read(`select to_jsonb(s) from public.cash_shifts s where id='${afternoon.id}'`),before);
  morning=next;
 });
 query(`update public.cash_shifts set opened_at=opened_at-interval '1 day',scheduled_end_at=clock_timestamp()-interval '1 second' where id='${morning.id}'`);
 check('A forgotten open turn is never silently counted or closed, and permissions remain enforced',()=>{
  denied('staff',`select public.open_cashbox_shift('${randomUUID()}',0)`,'40001');assert.equal(context().shift.id,morning.id);assert.equal(context().shift.status,'open');
  for(const who of ['anon','cook','barista','inactive','missing'])denied(who,`select public.open_cashbox_shift('${randomUUID()}',0)`,'42501');
 });
 query(schedule);

 const beforeGrace = fingerprint();
 applyMorningGrace();
 check('The grace migration preserves cash shifts and returns the cutoff in the normal cash context', () => {
  assert.equal(fingerprint(), beforeGrace);
  query(`update public.cash_shifts set opened_at='2026-11-03T14:00:00Z',
   shift_slot='morning', scheduled_start_at='2026-11-03T14:00:00Z',
   scheduled_end_at='2026-11-03T18:00:00Z' where id='${morning.id}'`);
  const shift = context().shift;
  assert.equal(Date.parse(shift.scheduled_end_at), Date.parse('2026-11-03T18:00:00Z'));
  assert.equal(Date.parse(shift.operational_end_at), Date.parse('2026-11-03T19:00:00Z'));
 });

 const pricing = JSON.parse(as('staff', 'select public.get_order_pricing_context()'));
 const items = JSON.stringify([{menu_item_id:espresso,quantity:1,expected_unit_price:10}]);
 const purchase = () => `select public.place_customer_order('takeaway','Para llevar',
  'Tolerancia QA','${items}','${pricing.date}',${pricing.revision},0,'cash','${randomUUID()}')`;
 check('Normal orders and payments pass during morning grace, with no extension for afternoon', () => {
  query(`update public.cash_shifts set opened_at=clock_timestamp(), shift_slot='morning',
   scheduled_start_at=clock_timestamp()-interval '2 hours',
   scheduled_end_at=clock_timestamp()-interval '30 minutes' where id='${morning.id}'`);
  as('staff', purchase());
  assert.equal(context().summary.cash, 10);

  query(`update public.cash_shifts set shift_slot='afternoon' where id='${morning.id}'`);
  assert.equal(context().shift.operational_end_at, context().shift.scheduled_end_at);
  denied('staff', purchase(), '55000');
 });
 check('Morning orders stop after the grace cutoff and manual closing still works', () => {
  query(`update public.cash_shifts set shift_slot='morning',
   scheduled_end_at=clock_timestamp()-interval '1 hour 1 second' where id='${morning.id}'`);
  denied('staff', purchase(), '55000');
  const {digest, summary} = context();
  const closed = JSON.parse(as('staff', `select public.close_cashbox_shift(
   '${randomUUID()}','${morning.id}','${digest}',${summary.expected_cash})`));
  assert.equal(closed.status, 'awaiting_receipt');
  assert.equal(closed.is_day_closed, false);
  assert.equal(Number(closed.cash_left), 10);
 });
}

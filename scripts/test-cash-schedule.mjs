import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function testCashSchedule({query,read,as,asSql,denied,check,id,espresso,cappuccino,concurrently,apply}){
 const original=read("select md5(string_agg(to_jsonb(o)::text,'' order by id)) from public.orders o");
 const oldShifts=read("select md5(string_agg(to_jsonb(s)::text,'' order by id)) from public.cash_shifts s");
 apply();
 check('Scheduled shift migration preserves all previous sales and cash cuts',()=>{assert.equal(read("select md5(string_agg(to_jsonb(o)::text,'' order by id)) from public.orders o"),original);assert.equal(read("select md5(string_agg((to_jsonb(s)-'shift_slot'-'scheduled_start_at'-'scheduled_end_at')::text,'' order by id)) from public.cash_shifts s"),oldShifts);});
 check('Bolivia schedule has exact 10:00, 14:00 and 21:30 boundaries independently of UTC date',()=>{
  for(const [time,slot,hours] of [['13:59:59','morning',false],['14:00:00','morning',true],['17:59:59','morning',true],['18:00:00','afternoon',true],['01:29:59','afternoon',true],['01:30:00','afternoon',false]]){
   const date=time.startsWith('01:')?'2026-11-04':'2026-11-03',s=JSON.parse(read(`select private.cash_schedule('${date}T${time}Z')`));assert.equal(s.slot,slot);assert.equal(s.in_hours,hours);assert.equal(s.date,'2026-11-03');
  }
 });
 const context=()=>JSON.parse(as('admin','select public.get_cashbox_context()'));
 const quote=JSON.parse(as('staff','select public.get_order_pricing_context()'));
 const items=JSON.stringify([{menu_item_id:espresso,quantity:1,expected_unit_price:10}]);
 const place=(key=randomUUID(),method='qr')=>`select public.place_customer_order('takeaway','Para llevar','Horario QA','${items}','${quote.date}',${quote.revision},0,'${method}','${key}')`;
 const before=read('select count(*) from public.orders'),shiftsBefore=read('select count(*) from public.cash_shifts');
 check('With no received/open shift, neither table nor takeaway registration can open a drawer implicitly',()=>{
  denied('staff',place(),'55000');denied('admin',`select * from public.create_order('Mesa QA')`,'55000');
  query('update private.cashbox_configuration set enabled=false');denied('staff',place(),'55000');query('update private.cashbox_configuration set enabled=true');
  assert.equal(read('select count(*) from public.orders'),before);assert.equal(read('select count(*) from public.cash_shifts'),shiftsBefore);
 });
 let active=context(),opening,openingKey=randomUUID();
 check('Manual opening assigns the current slot on the server and validates operating hours',()=>{
  if(active.schedule.in_hours){opening=JSON.parse(as('staff',`select public.open_cashbox_shift('${openingKey}',0,'${active.shift.id}','Recepción sintética')`));assert.equal(opening.shift_slot,active.schedule.slot);assert.equal(opening.scheduled_end_at,active.schedule.ends_at);assert.equal(JSON.parse(as('staff',`select public.open_cashbox_shift('${openingKey}',0,'${active.shift.id}','Recepción sintética')`)).id,opening.id);}
  else{
   denied('staff',`select public.open_cashbox_shift('${openingKey}',0,'${active.shift.id}','Recepción sintética')`,'55000');
   // A local-only synthetic open interval makes financial guards testable at any hour.
   query(`update public.cash_shifts set status='received',received_at=clock_timestamp(),received_by='${id.staff}',received_cash=cash_left,receipt_difference=0 where id='${active.shift.id}';insert into public.cash_shifts(id,cashier_id,opening_cash,shift_slot,scheduled_start_at,scheduled_end_at) values('${openingKey}','${id.staff}',0,'afternoon',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour')`);opening=context().shift;
  }
 });
 const responses=await Promise.all([concurrently(asSql('staff',place())),concurrently(asSql('admin',place()))]);
 let prepaid;
 check('Two simultaneous cashiers record separate orders in the same physical shift with the correct actor',()=>{
  assert(responses.every(r=>r.status===0),JSON.stringify(responses));const c=context();assert.equal(c.receipts.length,2);assert.equal(c.summary.qr,20);assert(c.receipts.some(r=>r.received_by===id.staff));assert(c.receipts.some(r=>r.received_by===id.admin));prepaid=JSON.parse(responses[0].out.trim()).order_id;
  assert.equal(read(`select count(distinct shift_id) from private.cash_shift_receipts r join public.order_cash_movements m on m.id=r.movement_id where m.order_id='${prepaid}'`),'1');
  if(c.schedule.in_hours)denied('admin',`select public.open_cashbox_shift('${randomUUID()}',0)`,'40001');
 });
 const purchase=JSON.parse(as('cook',`select public.create_employee_purchase('${items}','${randomUUID()}')`));
 const snapshot=JSON.parse(as('staff',`select public.get_order_edit_snapshot('${prepaid}')`));
 query(`update public.cash_shifts set scheduled_start_at=clock_timestamp()-interval '1 hour',scheduled_end_at=clock_timestamp()-interval '1 second' where id='${opening.id}'`);
 check('Expired shifts block new orders, employee collections and prepaid adjustments atomically',()=>{
  denied('staff',place(),'55000');denied('staff',`select public.checkout_employee_purchase('${purchase.order.id}','cash',${purchase.order.revision})`,'55000');
  const changes=JSON.stringify([{action:'add',menu_item_id:cappuccino,quantity:1,expected_unit_price:20}]);
  denied('admin',`select public.edit_prepaid_order('${prepaid}',${snapshot.order.revision},'${changes}','cash',20,'${randomUUID()}')`,'55000');
  assert.deepEqual(JSON.parse(as('staff',`select public.get_order_edit_snapshot('${prepaid}')`)),snapshot);assert.equal(read(`select count(*) from public.order_payments where order_id='${purchase.order.id}'`),'0');assert.equal(context().receipts.length,2);
 });
 check('A deadline never closes/counts money automatically; manual close stays available afterward',()=>{
  const c=context();assert.equal(c.shift.status,'open');const closed=JSON.parse(as('staff',`select public.close_cashbox_shift('${randomUUID()}','${c.shift.id}','${c.digest}',0)`));assert.equal(closed.status,'awaiting_receipt');assert.equal(closed.closing_snapshot.length,2);assert.equal(Number(closed.qr_net),20);denied('staff',place(),'55000');
 });
 check('Schedule helpers and shift mutations remain private and role protected',()=>{for(const who of ['anon','cook','barista','inactive','missing']){denied(who,`select public.open_cashbox_shift('${randomUUID()}',0)`,'42501');}for(const who of ['anon','staff','admin']){denied(who,'select private.assert_current_cash_shift()','42501');denied(who,"select private.cash_schedule(now())",'42501');}assert.equal(read("select count(*) from public.cash_shifts where status='open'"),'0');});
}

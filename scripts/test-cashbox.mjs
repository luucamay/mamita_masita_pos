import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function testCashbox({query,read,as,asSql,denied,check,id,espresso,cappuccino,concurrently}){
 id.cashier=randomUUID();query(`insert into public.profiles(id,role,full_name,active) values('${id.cashier}','staff','Incoming cashier QA',true);update public.menu_items set price=10,active=true where id='${espresso}';update public.menu_items set price=20,active=true where id='${cappuccino}';update public.daily_promotions set active=false`);
 const context=()=>JSON.parse(as('staff','select public.get_cashbox_context()'));
 const q=JSON.parse(as('staff','select public.get_order_pricing_context()'));
 const makeSql=(method='cash',key=randomUUID())=>`select public.place_customer_order('takeaway','Para llevar','Cash QA','[{"menu_item_id":"${espresso}","quantity":1,"expected_unit_price":10}]','${q.date}',${q.revision},0,'${method}','${key}')`;
 const make=(who='staff',method='cash')=>JSON.parse(as(who,makeSql(method))).order_id;
 const startKey=randomUUID();let first,closed;
 check('Cashbox remains dormant until explicit opening; permissions and idempotent opening preserve one shared drawer',()=>{
  assert.equal(context().enabled,false);assert.equal(context().shift,null);make('staff');assert.equal(read('select count(*) from private.cash_shift_receipts'),'0');assert.equal(context().receipts.length,0);
  for(const who of ['anon','cook','barista','inactive','missing'])denied(who,'select public.get_cashbox_context()','42501');
  first=JSON.parse(as('staff',`select public.open_cashbox_shift('${startKey}',100)`));
  assert.equal(JSON.parse(as('staff',`select public.open_cashbox_shift('${startKey}',100)`)).id,first.id);
  assert.equal(context().enabled,true);
  denied('admin',`select public.open_cashbox_shift('${randomUUID()}',0)`,'40001');
  for(const who of ['staff','admin'])denied(who,`update public.cash_shifts set opening_cash=1 where id='${first.id}'`,'42501');
  denied('staff',`select private.cash_receipts('${first.id}')`,'42501');
 });
 const a=make('admin'),b=make('staff','qr');
 const snap=order=>JSON.parse(as('staff',`select public.get_order_edit_snapshot('${order}')`));
 const add=JSON.parse(as('staff',`select public.edit_prepaid_order('${b}',${snap(b).order.revision},'[{"action":"add","menu_item_id":"${cappuccino}","quantity":1,"expected_unit_price":20}]','qr',20,'${randomUUID()}')`));
 const old=add.items.find(i=>i.menu_item_id===espresso);
 as('admin',`select public.edit_prepaid_order('${b}',${add.order.revision},'[{"action":"remove","order_item_id":"${old.id}"}]','cash',-10,'${randomUUID()}')`);
 const personal=JSON.parse(as('cook',`select public.create_employee_purchase('[{"menu_item_id":"${espresso}","quantity":1,"expected_unit_price":10}]','${randomUUID()}')`));
 as('admin',`select public.checkout_employee_purchase('${personal.order.id}','cash',${personal.order.revision})`);
 check('Drawer captures all cashiers, employee purchases, mixed tenders and signed refunds exactly once',()=>{
  const c=context();assert.equal(c.receipts.length,5);assert.equal(c.summary.cash,8);assert.equal(c.summary.qr,30);assert.equal(c.summary.expected_cash,108);
  assert(c.receipts.some(r=>r.purchase_type==='employee'&&Number(r.amount)===8));assert(c.receipts.some(r=>Number(r.amount)===-10));assert(c.receipts.some(r=>r.received_by===id.admin));assert.equal(Number(first.opening_cash),100);
 });
 const stale=context();make('staff');
 check('Closing detects receipts added after preview and does not change sales or reports',()=>{
  denied('staff',`select public.close_cashbox_shift('${randomUUID()}','${first.id}','${stale.digest}',108)`,'40001');
  const c=context();assert.equal(c.summary.expected_cash,118);
  denied('cashier',`select public.close_cashbox_shift('${randomUUID()}','${first.id}','${c.digest}',118)`,'42501');
  denied('staff',`select public.close_cashbox_shift('${randomUUID()}','${first.id}','${c.digest}',117)`,'22023');
  const report=as('admin','select public.get_sales_report()'),sales=read("select md5(string_agg(to_jsonb(o)::text,'' order by id)) from public.orders o");
  const key=randomUUID(),args=`'${key}','${first.id}','${c.digest}',118,30,'Retiro autorizado QA'`;
  closed=JSON.parse(as('staff',`select public.close_cashbox_shift(${args})`));assert.equal(closed.status,'awaiting_receipt');assert.equal(Number(closed.cash_left),88);assert.equal(Number(closed.difference),0);
  assert.equal(JSON.parse(as('staff',`select public.close_cashbox_shift(${args})`)).id,closed.id);
  assert.equal(as('admin','select public.get_sales_report()'),report);assert.equal(read("select md5(string_agg(to_jsonb(o)::text,'' order by id)) from public.orders o"),sales);
 });
 check('A closed drawer blocks financial writes atomically until another account receives it',()=>{
  const count=read('select count(*) from public.orders');
  denied('staff',makeSql(),'55000');assert.equal(read('select count(*) from public.orders'),count);
  denied('cashier',`select public.open_cashbox_shift('${randomUUID()}',83,'${closed.id}')`,'22023');
  const key=randomUUID(),args=`'${key}',83,'${closed.id}','Faltan cinco al recibir QA'`;
  const next=JSON.parse(as('cashier',`select public.open_cashbox_shift(${args})`));assert.equal(Number(next.opening_cash),83);assert.equal(next.cashier_id,id.cashier);
  assert.equal(JSON.parse(as('cashier',`select public.open_cashbox_shift(${args})`)).id,next.id);
  const previous=JSON.parse(read(`select to_jsonb(s) from public.cash_shifts s where id='${closed.id}'`));assert.equal(previous.status,'received');assert.equal(previous.received_by,id.cashier);assert.equal(Number(previous.receipt_difference),-5);assert.deepEqual(previous.closing_snapshot,closed.closing_snapshot);
 });
 check('Later-shift adjustments belong to the current drawer and never rewrite the delivered closing snapshot',()=>{
  let s=snap(b);
  s=JSON.parse(as('staff',`select public.edit_prepaid_order('${b}',${s.order.revision},'[{"action":"add","menu_item_id":"${espresso}","quantity":1,"expected_unit_price":10}]','cash',10,'${randomUUID()}')`));
  const capp=s.items.find(i=>i.menu_item_id===cappuccino&&i.status!=='voided');
  as('admin',`select public.edit_prepaid_order('${b}',${s.order.revision},'[{"action":"remove","order_item_id":"${capp.id}"}]','qr',-20,'${randomUUID()}')`);
  const next=context();assert.equal(next.summary.cash,10);assert.equal(next.summary.qr,-20);assert.equal(next.summary.expected_cash,93);
  assert.deepEqual(JSON.parse(read(`select closing_snapshot from public.cash_shifts where id='${closed.id}'`)),closed.closing_snapshot);
 });
 check('History defaults to Bolivia today, respects ownership and preserves the closing and receipt differences',()=>{
  const all=JSON.parse(as('admin','select public.list_cashbox_shifts()'));assert(all.range.today);assert(all.shifts.some(s=>s.id===first.id));
  const own=JSON.parse(as('staff','select public.list_cashbox_shifts()'));assert(own.shifts.every(s=>s.cashier_id===id.staff));
  denied('cashier',`select public.list_cashbox_shifts('${id.staff}')`,'42501');
  denied('admin',"select public.list_cashbox_shifts(null,'2026-03-02','2026-03-01')",'22023');
  const record=all.shifts.find(s=>s.id===first.id);assert.equal(Number(record.cash_net),18);assert.equal(Number(record.qr_net),30);assert.equal(Number(record.cash_left),88);assert.equal(Number(record.received_cash),83);
 });
 const current=JSON.parse(as('cashier','select public.get_cashbox_context()')),ordersBefore=Number(read('select count(*) from public.orders'));
 const race=await Promise.all([concurrently(asSql('staff',makeSql())),concurrently(asSql('cashier',`select public.close_cashbox_shift('${randomUUID()}','${current.shift.id}','${current.digest}',${current.summary.expected_cash})`))]);
 check('Concurrent payment versus close cannot lose a receipt or create an unpaid takeaway',()=>{
  assert.equal(race.filter(r=>r.status===0).length,1,JSON.stringify(race));
  const next=JSON.parse(as('cashier','select public.get_cashbox_context()'));
  if(race[0].status===0){assert.equal(next.shift.status,'open');assert.equal(next.summary.cash,20);assert.equal(Number(read('select count(*) from public.orders')),ordersBefore+1);}
  else{assert.equal(next.shift.status,'awaiting_receipt');assert.equal(Number(read('select count(*) from public.orders')),ordersBefore);}
 });
 check('Password reservations are admin-only, never store passwords and verify the Auth marker before completion',()=>{
  const key=randomUUID(),fp='a'.repeat(64),args=`'${key}','${id.staff}','${fp}'`;
  for(const who of ['anon','staff','cook','barista','inactive'])denied(who,`select public.admin_prepare_password_reset(${args})`,'42501');
  const first=JSON.parse(as('admin',`select public.admin_prepare_password_reset(${args})`));assert.equal(first.status,'pending');assert.equal(JSON.parse(as('admin',`select public.admin_prepare_password_reset(${args})`)).request_id,key);
  denied('admin',`select public.admin_prepare_password_reset('${randomUUID()}','${id.staff}','${fp}')`,'40001');
  denied('admin',`select public.admin_complete_password_reset('${key}')`,'42501');
  query(`insert into auth.users(id,email,raw_app_meta_data) values('${id.staff}','staff@qa.test','{"mamita_password_reset_request":"${key}"}') on conflict(id) do update set raw_app_meta_data=excluded.raw_app_meta_data`);
  const events=Number(read(`select count(*) from private.employee_events where action='password_reset'`));
  assert.equal(JSON.parse(as('admin',`select public.admin_complete_password_reset('${key}')`)).status,'completed');
  as('admin',`select public.admin_complete_password_reset('${key}')`);assert.equal(Number(read(`select count(*) from private.employee_events where action='password_reset'`)),events+1);
  denied('admin',`select public.admin_prepare_password_reset('${randomUUID()}','${id.admin}','${fp}')`,'22023');
  assert.equal(read("select count(*) from information_schema.columns where table_schema='private' and table_name='employee_password_requests' and column_name in('password','plain_password')"),'0');
 });
}

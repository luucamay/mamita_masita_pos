import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export function testAdminHistory({query,read,as,denied,check,id,espresso}){
 id.sales=randomUUID();
 query(`insert into public.profiles(id,full_name,role,active) values('${id.sales}','Sales author QA','staff',true);update public.daily_promotions set active=false`);
 const quote=JSON.parse(as('staff','select public.get_order_pricing_context()'));
 const make=(service='table')=>JSON.parse(as('sales',`select public.place_customer_order('${service}','QA','Client QA','[{"menu_item_id":"${espresso}","quantity":1,"expected_unit_price":10}]','${quote.date}',${quote.revision},0,${service==='table'?'null':"'cash'"},'${randomUUID()}')`)).order_id;
 const orders=Array.from({length:28},()=>make());
 for(const key of orders)query(`update public.orders set created_at='2036-03-01T04:00:00Z' where id='${key}'`);
 as('admin',`select public.mark_order_delivered('${orders[0]}');select public.checkout_order('${orders[0]}','qr')`);
 const paid=make('takeaway');query(`update public.orders set created_at='2036-03-01T04:00:00Z' where id='${paid}'`);
 const snap=()=>JSON.parse(as('staff',`select public.get_order_edit_snapshot('${paid}')`));
 const added=JSON.parse(as('staff',`select public.edit_prepaid_order('${paid}',${snap().order.revision},'[{"action":"add","menu_item_id":"${espresso}","quantity":1,"expected_unit_price":10}]','qr',10,'${randomUUID()}')`));
 const line=added.items.find(i=>i.status!=='voided');
 as('admin',`select public.edit_prepaid_order('${paid}',${added.order.revision},'[{"action":"remove","order_item_id":"${line.id}"}]','qr',-10,'${randomUUID()}')`);
 const before=make(),after=make();
 query(`update public.orders set created_at='2036-03-01T03:59:59.999Z' where id='${before}';update public.orders set created_at='2036-03-02T04:00:00Z' where id='${after}'`);
 const personal=JSON.parse(as('sales',`select public.create_employee_purchase('[{"menu_item_id":"${espresso}","quantity":1,"expected_unit_price":10}]','${randomUUID()}')`));
 query(`update public.orders set created_at='2036-03-01T04:00:00Z' where id='${personal.order.id}'`);
 const get=(page=0)=>JSON.parse(as('admin',`select public.admin_employee_sales_history('${id.sales}','2036-03-01','2036-03-01',${page})`));
 check('Admin history attributes customer orders to creator, excludes personal purchases and honors Bolivia boundaries',()=>{
  const value=get();assert.equal(value.total_count,29);assert.equal(value.summary.orders,29);assert.equal(Number(value.summary.total),290);assert.equal(Number(value.summary.collected),20);assert.equal(value.summary.pending,27);
  assert(!value.orders.some(o=>[before,after,personal.order.id].includes(o.id)));
 });
 check('History pagination is stable without duplicate rows and summary covers the whole range',()=>{
  const a=get(),b=get(1);assert.equal(a.orders.length,25);assert.equal(b.orders.length,4);assert.equal(new Set([...a.orders,...b.orders].map(o=>o.id)).size,29);assert.deepEqual(a.summary,b.summary);assert.equal(get(2).orders.length,0);
 });
 check('Cashier is separate from creator, mixed payments and signed refunds reconcile without duplicate initial payments',()=>{
  const rows=[...get().orders,...get(1).orders];
  const old=rows.find(o=>o.id===orders[0]);assert.equal(Number(old.collected),10);assert.equal(old.cashiers[0].id,id.admin);assert.deepEqual(old.methods,['qr']);
  const current=rows.find(o=>o.id===paid);assert.equal(Number(current.collected),10);assert.deepEqual(current.methods,['cash','qr']);assert.deepEqual(new Set(current.cashiers.map(c=>c.id)),new Set([id.sales,id.staff,id.admin]));assert.equal(current.items.length,1);
 });
 check('History is admin-only, validates dates and remains available after employee deactivation',()=>{
  for(const who of ['anon','staff','cook','barista','inactive','missing'])denied(who,`select public.admin_employee_sales_history('${id.sales}')`,'42501');
  for(const args of [`'${id.sales}','2036-03-02','2036-03-01',0`,`'${id.sales}','2036-01-01','2037-01-01',0`,`'${id.sales}','2036-03-01','2036-03-01',-1`,`null,'2036-03-01','2036-03-01',0`])denied('admin',`select public.admin_employee_sales_history(${args})`,'22023');
  query(`update public.profiles set active=false where id='${id.sales}'`);assert.equal(get().total_count,29);
  assert.equal(read("select prosecdef from pg_proc where oid='public.admin_employee_sales_history(uuid,date,date,integer)'::regprocedure"),'f');
 });
 check('Full catalog editing and retirement preserve sale snapshots; retired products cannot be ordered',()=>{
  const original=read(`select jsonb_agg(to_jsonb(i) order by id) from public.order_items i where order_id='${orders[0]}'`);
  as('admin',`update public.menu_items set name='Retired renamed QA',price=12.50,active=false where id='${espresso}'`);
  assert.equal(read(`select jsonb_agg(to_jsonb(i) order by id) from public.order_items i where order_id='${orders[0]}'`),original);
  denied('staff',`select public.create_order_with_items('QA',null,'${id.staff}','[{"menu_item_id":"${espresso}","quantity":1}]')`);
  as('admin',`update public.menu_items set active=true where id='${espresso}'`);
  assert.equal(read(`select active from public.menu_items where id='${espresso}'`),'t');
 });
}

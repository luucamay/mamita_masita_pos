import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function testPaymentObservations({query,read,as,denied,check,id,espresso,cappuccino,apply}){
 const legacy=()=>read("select jsonb_build_object('orders',(select md5(string_agg(to_jsonb(o)::text,'' order by id)) from public.orders o),'payments',(select md5(string_agg((to_jsonb(p)-'observation')::text,'' order by id)) from public.order_payments p),'movements',(select md5(string_agg((to_jsonb(m)-'observation')::text,'' order by id)) from public.order_cash_movements m),'shifts',(select md5(string_agg(to_jsonb(s)::text,'' order by id)) from public.cash_shifts s))");
 const before=legacy(),oldReport=as('admin','select public.get_sales_report()');
 apply();
 check('Note migration preserves every historical sale, receipt, cash cut and report amount',()=>{assert.equal(legacy(),before);assert.deepEqual(JSON.parse(as('admin','select public.get_sales_report()')),{...JSON.parse(oldReport),observations:[]});});
 const ctx=()=>JSON.parse(as('admin','select public.get_cashbox_context()'));
 let current=ctx();
 if(current.shift?.status==='open'){as('admin',`select public.close_cashbox_shift('${randomUUID()}','${current.shift.id}','${current.digest}',${current.summary.expected_cash},0,'Preparación sintética de notas')`);current=ctx();}
 as('staff',`select public.open_cashbox_shift('${randomUUID()}',0,${current.shift?`'${current.shift.id}'`:'null'},'Recepción sintética para notas')`);
 const quote=JSON.parse(as('staff','select public.get_order_pricing_context()'));
 const items=JSON.stringify([{menu_item_id:espresso,quantity:1,expected_unit_price:10}]);
 const sql=(key,note="'Promoción autorizada por la encargada'",service='takeaway')=>`select public.place_customer_order_with_observation('${service}','${service==='table'?'1':'Para llevar'}',null,'${items}','${quote.date}',${quote.revision},0,${service==='table'?'null':"'qr'"},'${key}',${note})`;
 let placed;const key=randomUUID();
 check('Takeaway note is atomic, trimmed and kept on payment and movement without double counting',()=>{
  placed=JSON.parse(as('staff',sql(key)));assert.equal(JSON.parse(as('staff',sql(key))).order_id,placed.order_id);
  assert.equal(read(`select observation from public.order_payments where order_id='${placed.order_id}'`),'Promoción autorizada por la encargada');
  assert.equal(read(`select observation from public.order_cash_movements where order_id='${placed.order_id}'`),'Promoción autorizada por la encargada');
  const c=ctx();assert.equal(c.receipts.length,1);assert.equal(c.receipts[0].observation,'Promoción autorizada por la encargada');assert.equal(c.summary.qr,10);
  denied('staff',sql(key,"'Otra nota'"),'22023');assert.equal(ctx().receipts.length,1);
 });
 check('Oversized notes, wrong roles and direct writes cannot create or rewrite financial records',()=>{
  const count=read('select count(*) from public.orders');denied('staff',sql(randomUUID(),"repeat('a',501)"),'22023');denied('staff',sql(randomUUID(),"'nota'",'table'),'22023');
  for(const who of ['anon','cook','barista','inactive','missing'])denied(who,sql(randomUUID()),'42501');
  for(const who of ['staff','admin']){denied(who,"update public.order_payments set observation='false'",'42501');denied(who,"update public.order_cash_movements set observation='false'",'42501');denied(who,`select private.attach_receipt_observation('${placed.order_id}','false',false)`,'42501');}
  assert.equal(read('select count(*) from public.orders'),count);
 });
 let table;
 check('Table checkout and employee checkout retain notes, actor identity and exact original totals',()=>{
  table=JSON.parse(as('staff',`select public.place_customer_order('table','2',null,'${items}','${quote.date}',${quote.revision},0,null,'${randomUUID()}')`)).order_id;
  as('staff',`select public.mark_order_delivered('${table}')`);
  const pay=`select * from public.checkout_order_with_observation('${table}','cash','${id.staff}','  Producto sustituido con autorización  ')`;
  as('staff',pay);as('staff',pay);assert.equal(read(`select observation||':'||amount from public.order_payments where order_id='${table}'`),'Producto sustituido con autorización:10.00');
  denied('cook',pay,'42501');denied('staff',pay.replace(id.staff,id.admin),'42501');denied('staff',pay.replace('Producto sustituido con autorización','Otra nota'),'22023');
  const purchase=JSON.parse(as('cook',`select public.create_employee_purchase('${items}','${randomUUID()}')`));
  const collect=`select public.checkout_employee_purchase_with_observation('${purchase.order.id}','cash',${purchase.order.revision},'Compra personal autorizada')`;
  as('staff',collect);as('staff',collect);denied('cook',collect,'42501');denied('staff',collect.replace('Compra personal autorizada','Cambio de nota'),'22023');
  assert.equal(read(`select amount||':'||observation from public.order_payments where order_id='${purchase.order.id}'`),'8.00:Compra personal autorizada');
 });
 check('Additional collections and refunds carry their own note and original request ID',()=>{
  const snapshot=()=>JSON.parse(as('staff',`select public.get_order_edit_snapshot('${placed.order_id}')`));
  const initial=snapshot(),request=randomUUID(),changes=JSON.stringify([{action:'add',menu_item_id:cappuccino,quantity:1,expected_unit_price:20}]);
  const add=`select public.edit_prepaid_order_with_observation('${placed.order_id}',${initial.order.revision},'${changes}','qr',20,'${request}','Adicional acordado')`;
  as('staff',add);as('staff',add);denied('staff',add.replace('Adicional acordado','Nota distinta'),'22023');
  const next=snapshot(),line=next.items.find(i=>i.menu_item_id===espresso),remove=JSON.stringify([{action:'remove',order_item_id:line.id}]);
  as('staff',`select public.edit_prepaid_order_with_observation('${placed.order_id}',${next.order.revision},'${remove}','cash',-10,'${randomUUID()}','Devolución por cambio de producto')`);
  const c=ctx();assert.equal(c.receipts.length,5);assert.equal(c.summary.cash,8);assert.equal(c.summary.qr,30);assert(c.receipts.some(r=>r.observation==='Devolución por cambio de producto'&&r.amount===-10));
 });
 check('Report notes respect Bolivia daily/weekly/monthly dates, tender and purchase filters',()=>{
  for(const period of ['daily','weekly','monthly']){
   const report=JSON.parse(as('admin',`select public.get_sales_report('${period}','${quote.date}')`));assert.equal(report.observations.length,5);assert.equal(report.observations.filter(r=>r.kind==='initial'&&r.order_id===placed.order_id).length,1);
  }
  const cash=JSON.parse(as('admin',`select public.get_sales_report('daily','${quote.date}','cash')`));assert.equal(cash.observations.length,3);assert(cash.observations.every(r=>r.method==='cash'));
  const team=JSON.parse(as('admin',`select public.get_sales_report('daily','${quote.date}','all','employee')`));assert.equal(team.observations.length,1);assert.equal(team.observations[0].amount,8);
  assert.equal(JSON.parse(as('admin',"select public.get_sales_report('daily','2099-12-31')")).observations.length,0);denied('staff','select public.get_sales_report()','42501');
 });
 check('Closing freezes receipt observations and displays the separate closing incident without changing totals',()=>{
  const c=ctx(),report=as('admin','select public.get_sales_report()');
  const closed=JSON.parse(as('staff',`select public.close_cashbox_shift('${randomUUID()}','${c.shift.id}','${c.digest}',${c.summary.expected_cash},0,'Incidente del turno para revisión de la dueña')`));
  assert.equal(closed.closing_snapshot.length,5);assert(closed.closing_snapshot.every(r=>r.observation));assert.equal(closed.close_note,'Incidente del turno para revisión de la dueña');assert.equal(Number(closed.cash_net),8);assert.equal(Number(closed.qr_net),30);
  as('staff',sql(key));assert.equal(as('admin','select public.get_sales_report()'),report);assert.deepEqual(ctx().receipts,closed.closing_snapshot);
  denied('staff',sql(key,"'No reescribir cierre'"),'22023');assert.deepEqual(ctx().receipts,closed.closing_snapshot);
 });
}

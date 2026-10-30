import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function testCustomerFlows({query,read,as,asSql,denied,check,id,espresso,focaccia,cappuccino,concurrently}){
  query(`update public.daily_promotions set active=false;update public.menu_items set price=case id when '${espresso}' then 10 when '${focaccia}' then 49 else 20 end where id in ('${espresso}','${focaccia}','${cappuccino}')`);
  const quote=JSON.parse(as('staff','select public.get_order_pricing_context()'));
  const args=(service='takeaway',method="'cash'",request=randomUUID())=>`'${service}','7.1','QA', '[{"menu_item_id":"${espresso}","quantity":1,"expected_unit_price":10},{"menu_item_id":"${focaccia}","quantity":1,"expected_unit_price":49}]'::jsonb,'${quote.date}',${quote.revision},0,${method},'${request}'`;
  const snapshot=key=>JSON.parse(as('staff',`select public.get_order_edit_snapshot('${key}')`));
  const report=()=>JSON.parse(as('admin','select public.get_sales_report()'));
  const before=report();let paid;const request=randomUUID(),placement=args('takeaway',"'cash'",request);
  check('Customer takeaway is charged atomically, stays confirmed and creation retries do not duplicate',()=>{
    const result=JSON.parse(as('staff',`select public.place_customer_order(${placement})`));paid=result.order_id;const retry=JSON.parse(as('staff',`select public.place_customer_order(${placement})`));assert.equal(retry.order_id,paid);
    const s=snapshot(paid);assert.equal(s.order.status,'confirmado');assert(s.order.paid_at);assert(Date.parse(s.order.paid_at)>=Date.parse(s.order.created_at));assert.equal(read(`select recorded_at=paid_at from public.order_cash_movements m join public.order_payments p on p.order_id=m.order_id where m.order_id='${paid}'`),'t');assert.equal(Number(s.order.total),59);assert.equal(read(`select count(*) from public.order_payments where order_id='${paid}'`),'1');assert.equal(read(`select count(*) from public.order_cash_movements where order_id='${paid}'`),'1');
    const after=report();assert.equal(Math.round((after.summary.total-before.summary.total)*100),5900);assert.equal(after.summary.orders-before.summary.orders,1);
  });
  const addition=[{action:'add',menu_item_id:cappuccino,quantity:1,expected_unit_price:20}];let addArgs;
  check('Paid edits require the exact difference; failure rolls back items, revision and money',()=>{
    const s=snapshot(paid);denied('staff',`select public.edit_prepaid_order('${paid}',${s.order.revision},'${JSON.stringify(addition)}','qr',999,'${randomUUID()}')`);
    assert.deepEqual(snapshot(paid),s);assert.equal(read(`select count(*) from public.order_cash_movements where order_id='${paid}'`),'1');
    denied('staff',`select public.add_order_item('${paid}','${cappuccino}',1)`);denied('staff',`select * from private.add_unsettled_item_internal('${paid}','${cappuccino}',1,'${id.staff}')`,'42501');
  });
  check('Additional QR collection is idempotent and does not reset creation or original payment',()=>{
    const s=snapshot(paid);addArgs=`'${paid}',${s.order.revision},'${JSON.stringify(addition)}','qr',20,'${randomUUID()}'`;
    const result=JSON.parse(as('staff',`select public.edit_prepaid_order(${addArgs})`));assert.equal(Number(result.order.total),79);assert.equal(result.order.created_at,s.order.created_at);assert.equal(result.order.paid_at,s.order.paid_at);
    as('staff',`select public.edit_prepaid_order(${addArgs})`);assert.equal(read(`select count(*) from public.order_cash_movements where order_id='${paid}'`),'2');assert.deepEqual(result.order.payment_methods,['cash','qr']);
  });
  check('Refunds retain their tender and reconcile ledger, product quantities and report without double-counting',()=>{
    const s=snapshot(paid),line=s.items.find(i=>i.menu_item_id===focaccia);const change=[{action:'remove',order_item_id:line.id}];
    const result=JSON.parse(as('staff',`select public.edit_prepaid_order('${paid}',${s.order.revision},'${JSON.stringify(change)}','qr',-49,'${randomUUID()}')`));assert.equal(Number(result.order.total),30);
    assert.equal(read(`select sum(amount) from public.order_cash_movements where order_id='${paid}'`),'30.00');const after=report();assert.equal(Math.round((after.summary.total-before.summary.total)*100),3000);assert.equal(Math.round((after.summary.cash.amount-before.summary.cash.amount)*100),5900);assert.equal(Math.round((after.summary.qr.amount-before.summary.qr.amount)*100),-2900);assert.equal(after.summary.orders-before.summary.orders,1);assert.equal(after.summary.units-before.summary.units,2);
    assert.equal(Math.round(after.rows.reduce((sum,r)=>sum+Number(r.total_sale_value),0)*100),Math.round(after.filtered.total*100));
  });
  check('Prepaid delivery archives without another payment and archived orders reject new edits',()=>{
    as('staff',`select public.deliver_prepaid_order('${paid}')`);as('staff',`select public.deliver_prepaid_order('${paid}')`);const s=snapshot(paid);assert.equal(s.order.status,'archivado');assert(s.order.delivered_at);assert.equal(read(`select count(*) from public.order_payments where order_id='${paid}'`),'1');denied('staff',`select public.edit_prepaid_order('${paid}',${s.order.revision},'${JSON.stringify(addition)}','cash',20,'${randomUUID()}')`);
  });
  check('Table service retains flexible names and the original consume-then-pay sequence',()=>{
    const key=JSON.parse(as('staff',`select public.place_customer_order(${args('table','null')})`)).order_id;assert.equal(snapshot(key).order.table_number,'7.1');assert.equal(snapshot(key).order.paid_at,null);assert.equal(read(`select count(*) from public.order_payments where order_id='${key}'`),'0');denied('staff',`select public.deliver_prepaid_order('${key}')`);as('staff',`select public.mark_order_delivered('${key}')`);as('staff',`select public.checkout_order('${key}','qr')`);assert.equal(snapshot(key).order.status,'archivado');
  });
  check('Customer payment operations enforce role and ledger table permissions',()=>{
    for(const who of ['anon','inactive','missing','cook','barista']){denied(who,`select public.place_customer_order(${args()})`,'42501');denied(who,`select public.deliver_prepaid_order('${paid}')`,'42501');denied(who,`select public.edit_prepaid_order('${paid}',1,'[]','cash',0,'${randomUUID()}')`,'42501');}
    denied('staff',`delete from public.order_cash_movements where order_id='${paid}'`,'42501');
  });
  const concurrent=args('takeaway',"'qr'",randomUUID());const results=await Promise.all([concurrently(asSql('staff',`select public.place_customer_order(${concurrent})`)),concurrently(asSql('staff',`select public.place_customer_order(${concurrent})`))]);
  check('Concurrent identical placement creates one order and one payment',()=>{assert(results.every(r=>r.status===0),results.map(r=>r.error).join('\n'));assert.equal(JSON.parse(results[0].out).order_id,JSON.parse(results[1].out).order_id);});
  check('Closed defaults to Bolivia today, explicit filters preserve full paginated history',()=>{
    const today=JSON.parse(as('staff','select public.get_orders_board_compact(true)'));assert(today.closed_filter.date);assert.equal(today.closed_filter.all_dates,false);assert(today.orders.some(o=>o.id===paid));
    const empty=JSON.parse(as('staff',"select public.get_orders_board_compact(true,null,1,'2099-01-01',false)"));assert.equal(empty.pagination.total,0);
    const all=JSON.parse(as('staff',"select public.get_orders_board_compact(true,null,1,'2099-01-01',true)"));assert(all.pagination.total>empty.pagination.total);assert(all.orders.length<=24);
  });
  check('A refund on a later day is reported on that day without rewriting the original collection',()=>{
    query(`update public.order_cash_movements set recorded_at='2035-05-01T04:00:00Z' where order_id='${paid}' and amount<0`);
    const value=JSON.parse(as('admin',"select public.get_sales_report('daily','2035-05-01')"));assert.equal(Number(value.summary.total),-49);assert.equal(Number(value.summary.qr.amount),-49);assert.equal(value.summary.units,-1);assert.equal(value.summary.orders,1);
  });
  check('Prepaid adjustments keep the original promotion and reconcile discounted cents',()=>{
    query(`insert into public.daily_promotions(promotion_date,discount_bps,active,created_by,updated_by) values((now() at time zone 'America/La_Paz')::date,1500,true,'${id.admin}','${id.admin}') on conflict(promotion_date) do update set discount_bps=1500,active=true,updated_by='${id.admin}'`);
    const promo=JSON.parse(as('staff','select public.get_order_pricing_context()'));
    const input=args().replace(`'${quote.date}',${quote.revision},0`,`'${promo.date}',${promo.revision},1500`);
    const key=JSON.parse(as('staff',`select public.place_customer_order(${input})`)).order_id;const s=snapshot(key);assert.equal(Number(s.order.total),50.15);
    query('update public.daily_promotions set active=false');
    const result=JSON.parse(as('staff',`select public.edit_prepaid_order('${key}',${s.order.revision},'${JSON.stringify(addition)}','qr',17,'${randomUUID()}')`));assert.equal(result.order.discount_bps,1500);assert.equal(Number(result.order.total),67.15);assert.equal(read(`select sum(amount) from public.order_cash_movements where order_id='${key}'`),'67.15');
  });
}

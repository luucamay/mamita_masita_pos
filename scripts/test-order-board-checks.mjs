import assert from "node:assert/strict";
export function testOrderBoard({query,read,as,denied,check,id}) {
  check("P13 header publication is added and existing items remain published",()=>{
    assert.equal(read("select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('orders','order_items')"),"2");
  });
  check("P13 only active admin and staff can read the board, including its selected detail",()=>{
    for(const who of ["anon","cook","barista","inactive","missing"])denied(who,"select public.get_orders_board()","42501");
    for(const who of ["admin","staff"]){const value=JSON.parse(as(who,"select public.get_orders_board()"));assert(Array.isArray(value.orders));assert(Number.isFinite(Date.parse(value.server_time)));}
    denied("admin","select public.get_orders_board(null)","22023");
  });
  check("P13 one canonical snapshot includes products and excludes canceled/closed cards",()=>{
    const value=JSON.parse(as("admin","select public.get_orders_board()"));assert(value.orders.every(order=>!order.employee_cancelled_at&&["pendiente","confirmado","entregado"].includes(order.status)));
    for(const order of value.orders){assert.equal(order.item_count,order.items.filter(item=>item.status!=="voided").length);assert.equal(Math.round(order.total*100),order.items.filter(item=>item.status!=="voided").reduce((sum,item)=>sum+Math.round(item.net_total*100),0));}
  });
  check("P13 selected paid order remains available even after leaving the active board",()=>{
    const key=read("select id from public.orders where status='archivado' order by id limit 1");const value=JSON.parse(as("staff",`select public.get_orders_board(false,'${key}')`));assert.equal(value.selected.id,key);assert.equal(value.orders.some(order=>order.id===key),false);assert(value.selected.items.length>0);
  });
  query(`insert into public.orders(order_number,table_number,created_by) select 'P13-BULK-'||g,'QA','${id.staff}' from generate_series(1,1005)g`);
  check("P13 JSON snapshot does not truncate more than one thousand headers",()=>{
    const value=JSON.parse(as("admin","select public.get_orders_board()"));assert(value.orders.length>1000);assert.equal(value.orders.length,Number(read("select count(*) from public.orders where status in ('pendiente','confirmado','entregado') and employee_cancelled_at is null")));assert.equal(new Set(value.orders.map(order=>order.id)).size,value.orders.length);
  });
  check("P13 fresh active profile permissions are enforced after access changes",()=>{
    query(`update public.profiles set active=false where id='${id.staff}'`);denied("staff","select public.get_orders_board()","42501");query(`update public.profiles set active=true where id='${id.staff}'`);
  });
}

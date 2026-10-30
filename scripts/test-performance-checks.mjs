import assert from "node:assert/strict";
export function testPerformance({query,read,as,denied,check,id}){
  // Synthetic local rows only; all timestamps equal to exercise the ID tie-break.
  query(`insert into public.orders(order_number,table_number,status,created_by,paid_at) select 'P14-PAID-'||g,'QA','archivado','${id.staff}','2026-10-30T12:00:00Z' from generate_series(1,55)g`);
  check("P14 page RPC denies anonymous, inactive and queue-only identities",()=>{
    for(const who of ["anon","inactive","missing","cook","barista"])denied(who,"select public.get_orders_board_page(true)","42501");
    for(const args of ["true,null,0","true,null,null","true,null,1000001","false,null,2","null,null,1"])denied("admin",`select public.get_orders_board_page(${args})`,"22023");
  });
  check("P14 every closed order and its canonical lines remain reachable exactly once",()=>{
    const original=JSON.parse(as("staff","select public.get_orders_board(true)")),seen=[];
    const first=JSON.parse(as("staff","select public.get_orders_board_page(true)"));assert.equal(first.pagination.size,24);assert.equal(first.pagination.total,original.orders.length);
    for(let page=1;page<=first.pagination.pages;page++){const value=JSON.parse(as("staff",`select public.get_orders_board_page(true,null,${page})`));assert(value.orders.length<=24);seen.push(...value.orders);}
    assert.deepEqual(seen,original.orders);assert.equal(new Set(seen.map(o=>o.id)).size,seen.length);
  });
  check("P14 out-of-range pages clamp and selected detail can be outside the current page",()=>{
    const original=JSON.parse(as("admin","select public.get_orders_board(true)")),key=original.orders.at(-1).id;
    const first=JSON.parse(as("admin",`select public.get_orders_board_page(true,'${key}',1)`));assert.equal(first.selected.id,key);assert(!first.orders.some(o=>o.id===key));
    const last=JSON.parse(as("admin","select public.get_orders_board_page(true,null,1000000)"));assert.equal(last.pagination.page,last.pagination.pages);assert(last.orders.length>0);
  });
  check("P14 active board remains complete above one thousand headers",()=>{
    const old=JSON.parse(as("staff","select public.get_orders_board(false)")),now=JSON.parse(as("staff","select public.get_orders_board_page(false)"));assert(old.orders.length>1000);assert.deepEqual(now.orders,old.orders);assert.equal(now.pagination,null);
  });
}

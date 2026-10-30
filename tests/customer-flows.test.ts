import assert from "node:assert/strict";
import { test } from "node:test";
import { orderDurations } from "../lib/order-board.ts";
import { orderIsEditable } from "../lib/order-edit.ts";
import { aggregateReportProducts } from "../lib/report-products.ts";
import { normalizeSalesReport } from "../lib/report-contract.ts";
const prepaid={id:"qa",order_number:"QA",table_number:"Para llevar",customer_name:null,status:"confirmado" as const,created_at:"2026-10-30T12:00:00Z",paid_at:"2026-10-30T12:00:01Z",delivered_at:null,total:10,item_count:1,payment_methods:["cash" as const]};
test("Prepaid preparation continues after payment; paid-order editing stops on delivery",()=>{
  const time=orderDurations(prepaid,Date.parse("2026-10-30T12:10:00Z"));assert.equal(time.preparation,600000);assert.equal(time.account,1000);assert.equal(time.preparationStopped,false);assert.equal(time.accountStopped,true);assert.equal(orderIsEditable(prepaid),true);assert.equal(orderIsEditable({...prepaid,delivered_at:"2026-10-30T12:05:00Z"}),false);assert.equal(orderIsEditable({...prepaid,status:"archivado"}),false);
});
test("Product reporting supports a later refund as negative units and income",()=>{
  const row={date:"2026-10-30",menu_item_id:"bread",product_or_service:"Pan",quantity:-1,unit_price:49,total_sale_value:-49,payment_method:"qr" as const};
  assert.equal(aggregateReportProducts([row])[0].income,-49);assert.equal(aggregateReportProducts([row])[0].quantity,-1);
  const value={range:{start_date:"2026-10-30"},summary:{total:-49,orders:1,units:-1,cash:{amount:0,orders:0},qr:{amount:-49,orders:1},other:{amount:0,orders:0}},filtered:{total:-49,orders:1,units:-1},rows:[row]};
  assert.equal(normalizeSalesReport(value).summary.qr.amount,-49);assert.throws(()=>normalizeSalesReport({...value,rows:[{...row,unit_price:-49}]}));
});

import assert from"node:assert/strict";
import{test}from"node:test";
import{createSalesReportCsv}from"../lib/report-csv.ts";
test("employee income stays in the export and is distinguishable from customer income",()=>{
 const base={date:"2026-10-29",order_time:"2026-10-29T12:00:00Z",product_or_service:"Compra QA",quantity:1,unit_price:59,payment_method:"qr" as const};
 const csv=createSalesReportCsv([{...base,purchase_type:"employee",total_sale_value:47.2},{...base,purchase_type:"customer",total_sale_value:59}]);
 assert.match(csv,/Purchase Type/);assert.match(csv,/47.2,QR,Compra de empleado/);assert.match(csv,/59,QR,Cliente/);
});

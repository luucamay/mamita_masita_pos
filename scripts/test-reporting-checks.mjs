import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
export function testReporting({ query, read, as, denied, check, id, espresso, focaccia, cappuccino, includeSummary = false }) {
  function sale(paidAt, items, method = "cash", discount = 0, employee = false) {
    const order = randomUUID();
    query(`insert into public.orders(id,order_number,table_number,created_by,created_at,discount_bps,purchase_type,buyer_employee_id) values('${order}','REPORT-${order}','QA','${id.staff}','2030-01-01T12:00:00Z',${discount},'${employee ? "employee" : "customer"}',${employee ? `'${id.cook}'` : "null"});`);
    for (const line of items) query(`insert into public.order_items(order_id,menu_item_id,item_name,category_name,queue_type,unit_price,quantity,status) values('${order}','${line.product}','${line.name ?? "Producto QA"}','QA','cafe',${line.price},${line.quantity ?? 1},'${line.voided ? "voided" : "pending"}')`);
    query(`update public.orders set status='archivado',paid_at='${paidAt}',payment_method='${method}' where id='${order}';insert into public.order_payments(order_id,method,amount,received_by,paid_at) select id,'${method}',total,'${id.staff}','${paidAt}' from public.orders where id='${order}';`);
    return order;
  }
  sale("2030-02-01T03:59:59Z", [{ product: espresso, price: 10 }, { product: focaccia, price: 49 }]);
  sale("2030-02-01T04:00:00Z", [{ product: cappuccino, price: 20, quantity: 2 }], "qr", 1500);
  sale("2030-02-01T05:00:00Z", [{ product: espresso, price: 10 }], "cash", 2000, true);
  sale("2030-02-02T12:00:00Z", [{ product: espresso, price: 10 }], "card");
  sale("2030-02-03T12:00:00Z", [{ product: espresso, price: 10 }, { product: focaccia, price: 49, voided: true }]);
  sale("2030-02-04T12:00:00Z", [{ product: espresso, price: 10 }, { product: espresso, price: 12 }]);
  const report = (date, period = "daily", payment = "all", purchase = "all") => JSON.parse(as("admin", `select public.get_sales_report('${period}','${date}','${payment}','${purchase}')`));
  check("P09 midnight counts payment date in Bolivia rather than order creation", () => {
    const before = report("2030-01-31"), after = report("2030-02-01");
    assert.equal(before.summary.total, 59); assert.equal(before.summary.orders, 1); assert.equal(before.summary.units, 2);
    assert.equal(after.summary.total, 42); assert.equal(after.summary.orders, 2); assert.equal(after.summary.units, 3);
    assert.equal(after.rows.find(row => row.purchase_type === "employee").total_sale_value, 8);
    assert.equal(after.rows.find(row => row.payment_method === "qr").quantity, 2);
  });
  check("P09 week is Monday through Sunday and month excludes adjacent days", () => {
    const week = report("2030-02-01", "weekly"), month = report("2030-02-01", "monthly");
    assert.equal(week.range.start_date, "2030-01-28"); assert.equal(week.range.end_date_exclusive, "2030-02-04");
    assert.equal(week.summary.total, 121); assert.equal(week.summary.orders, 5);
    assert.equal(month.range.end_date_exclusive, "2030-03-01"); assert.equal(month.summary.total, 84);
  });
  check("P09 payment filters change detail while summary respects period and purchase scope", () => {
    const cash = report("2030-02-01", "daily", "cash");
    assert.equal(cash.filtered.total, 8); assert.equal(cash.summary.total, 42); assert.equal(cash.rows.length, 1);
    assert.equal(report("2030-02-01", "daily", "all", "customer").summary.total, 34);
    assert.equal(report("2030-02-01", "daily", "all", "employee").summary.total, 8);
    const other = report("2030-02-02", "daily", "other"); assert.equal(other.filtered.total, 10); assert.equal(other.summary.other.orders, 1);
  });
  check("P09 voided lines excluded and historical prices grouped without inventing a unit price", () => {
    assert.equal(report("2030-02-03").summary.total, 10);
    const mixed = report("2030-02-04"); assert.equal(mixed.rows.length, 1); assert.equal(mixed.rows[0].unit_price, null); assert.equal(mixed.rows[0].total_sale_value, 22);
  });
  check("P09 empty periods return actual zero totals and forbidden roles cannot query", () => {
    const empty = report("2031-01-01"); assert.equal(empty.summary.total, 0); assert.equal(empty.rows.length, 0);
    for (const who of ["anon", "staff", "cook", "barista", "inactive", "missing"]) denied(who, "select public.get_sales_report()", "42501");
    for (const sql of ["select public.get_sales_report('bad')", "select public.get_sales_report('daily',null,'bad')", "select public.get_sales_report('daily',null,'all','bad')", "select public.get_sales_report('daily','2100-01-01')"]) denied("admin", sql, "22023");
    query(`update public.profiles set active=false where id='${id.admin}'`); denied("admin", "select public.get_sales_report()", "42501"); query(`update public.profiles set active=true where id='${id.admin}'`);
  });
  const bulk = randomUUID();
  query(`insert into public.orders(id,order_number,table_number,created_by,created_at) values('${bulk}','REPORT-${bulk}','QA','${id.staff}','2030-02-15T12:00:00Z');insert into public.order_items(order_id,menu_item_id,item_name,category_name,queue_type,unit_price,quantity) select '${bulk}','${espresso}','Bulk QA '||g,'QA','cafe',1,1 from generate_series(1,1005)g;update public.orders set status='archivado',paid_at='2030-02-15T12:00:00Z',payment_method='cash' where id='${bulk}';insert into public.order_payments(order_id,method,amount,received_by,paid_at) select id,'cash',total,'${id.staff}','2030-02-15T12:00:00Z' from public.orders where id='${bulk}'`);
  check("P09 more than 1000 groups remain complete with no duplicated order totals", () => {
    const large = report("2030-02-15"); assert.equal(large.rows.length, 1005); assert.equal(large.summary.orders, 1); assert.equal(large.summary.total, 1005); assert.equal(large.filtered.units, 1005);
    assert.equal(large.rows.reduce((sum, row) => sum + row.total_sale_value, 0), 1005);
    assert.equal(report("2030-02-01", "monthly").summary.total, 1089);
  });
  if (includeSummary) {
    sale("2030-03-01T12:00:00Z", [{ product: espresso, price: 10 }, { product: focaccia, price: 49 }]);
    sale("2030-03-01T13:00:00Z", [{ product: cappuccino, price: 20, quantity: 2 }], "qr", 1500);
    check("P10 cash 59 plus discounted QR 34 is 93, exactly two orders and four units", () => {
      const result = report("2030-03-01");
      assert.equal(result.summary.total, 93); assert.equal(result.summary.orders, 2); assert.equal(result.summary.units, 4);
      assert.equal(result.summary.cash.amount, 59); assert.equal(result.summary.qr.amount, 34);
      assert.equal(result.summary.cash.orders, 1); assert.equal(result.summary.qr.orders, 1);
    });
    sale("2030-03-01T14:00:00Z", [{ product: espresso, price: 10 }, { product: focaccia, price: 49 }], "cash", 2000, true);
    sale("2030-03-01T15:00:00Z", [{ product: espresso, price: 10 }], "card");
    check("P10 employee income and other methods reconcile, payment filter preserves scoped cash summary", () => {
      const result = report("2030-03-01", "daily", "qr");
      assert.equal(result.summary.total, 150.2); assert.equal(result.summary.orders, 4); assert.equal(result.summary.units, 7);
      assert.equal(result.summary.cash.amount, 106.2); assert.equal(result.summary.qr.amount, 34); assert.equal(result.summary.other.amount, 10);
      assert.equal(result.filtered.total, 34); assert.equal(result.filtered.orders, 1);
      assert.equal(report("2030-03-01", "daily", "all", "employee").summary.total, 47.2);
    });
  }
}

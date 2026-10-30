import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateReportProducts } from "../lib/report-products.ts";
import { homeForRole, canAccessPath } from "../lib/permissions.ts";
const base = { date: "2026-10-30", menu_item_id: "cappuccino", product_or_service: "Cappuccino", quantity: 2, unit_price: 20, total_sale_value: 34, payment_method: "qr" as const, purchase_type: "customer" as const };
test("P11 two discounted Cappuccino show two units and net 34, with employee sales identified", () => {
  assert.equal(aggregateReportProducts([base])[0].income, 34);
  const result = aggregateReportProducts([base, { ...base, quantity: 1, total_sale_value: 16, payment_method: "cash", purchase_type: "employee" }]);
  assert.equal(result.length, 1); assert.equal(result[0].quantity, 3); assert.equal(result[0].income, 50); assert.equal(result[0].employeeQuantity, 1); assert.equal(result[0].employeeIncome, 16);
});
test("P11 grouping preserves product identity and historical name but merges price and payment differences", () => {
  assert.equal(aggregateReportProducts([base, { ...base, unit_price: 21, total_sale_value: 42 }])[0].income, 76);
  assert.equal(aggregateReportProducts([base, { ...base, menu_item_id: "another" }, { ...base, product_or_service: "Café histórico" }]).length, 3);
  const cents = aggregateReportProducts([{ ...base, total_sale_value: 0.1 }, { ...base, total_sale_value: 0.2 }]); assert.equal(cents[0].income, 0.3);
});
test("P11 dashboard starts admin on reports and keeps operational roles and menu permissions", () => {
  assert.equal(homeForRole("admin"), "/historial"); assert.equal(homeForRole("staff"), "/"); assert.equal(homeForRole("cook"), "/cocina"); assert.equal(homeForRole("barista"), "/cafe");
  for (const role of ["admin", "staff", "cook", "barista"] as const) assert.equal(canAccessPath({ role, active: true }, "/menu"), ["admin", "staff"].includes(role));
});

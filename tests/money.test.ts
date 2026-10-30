import assert from "node:assert/strict";
import test from "node:test";
import { priceOrder, toCents } from "../lib/money.ts";

const cafe = [{ id: "a", unitPrice: "10.00", quantity: 1 }, { id: "b", unitPrice: "49.00", quantity: 1 }];
test("preserves the Bs 59 base order and the fixed employee calculation", () => {
  assert.equal(priceOrder(cafe).netCents, 5900);
  const employee = priceOrder(cafe, 2000);
  assert.deepEqual([employee.grossCents, employee.discountCents, employee.netCents], [5900, 1180, 4720]);
  assert.equal(priceOrder([{ id: "c", unitPrice: 20, quantity: 2 }], 1500).netCents, 3400);
  assert.equal(priceOrder([{ id: "d", unitPrice: 2.5, quantity: 3 }], 2000).netCents, 600);
});
test("rounds half up once and distributes centavos deterministically", () => {
  const lines = [{ id: "b", unitPrice: "0.01", quantity: 1 }, { id: "a", unitPrice: "0.01", quantity: 1 }];
  const order = priceOrder(lines, 5000);
  assert.deepEqual(order.lines.map((l) => l.discountCents), [0, 1]);
  assert.equal(priceOrder([{ id: "a", unitPrice: "0.05", quantity: 1 }], 1000).discountCents, 1);
});
test("line allocations always reconcile with order totals", () => {
  for (const bps of [0, 1500, 2000, 3333, 9999, 10000]) {
    const lines = Array.from({ length: 20 }, (_, i) => ({ id: String(i).padStart(2, "0"), unitPrice: ((i * 137 + 1) / 100).toFixed(2), quantity: i + 1 }));
    const order = priceOrder(lines, bps);
    assert.equal(order.lines.reduce((s, l) => s + l.netCents, 0), order.netCents);
    assert.equal(order.lines.reduce((s, l) => s + l.discountCents, 0), order.discountCents);
    assert(order.lines.every((l) => l.netCents >= 0));
    assert.deepEqual(priceOrder([...lines].reverse(), bps).lines.reverse(), order.lines);
  }
  assert.equal(priceOrder([{ id: "free", unitPrice: 0, quantity: 1 }], 2000).netCents, 0);
  assert.equal(priceOrder([]).netCents, 0);
});
test("rejects invalid input, duplicate lines and database-range overflow", () => {
  for (const value of [NaN, Infinity, -1, "1e2", "1.001", "", "100000000.00"]) assert.throws(() => toCents(value));
  for (const quantity of [0, -1, 1.5, Infinity]) assert.throws(() => priceOrder([{ id: "a", unitPrice: 10, quantity }]));
  for (const bps of [-1, 10001, 0.5, NaN]) assert.throws(() => priceOrder(cafe, bps));
  assert.throws(() => priceOrder([cafe[0], cafe[0]]));
  assert.throws(() => priceOrder([{ id: "a", unitPrice: "99999999.99", quantity: 2 }]));
  assert.equal(toCents("99999999.99"), 9_999_999_999);
});

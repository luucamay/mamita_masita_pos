import assert from "node:assert/strict";
import test from "node:test";
import { paymentPresentation } from "../lib/payment.ts";
import { splitPayment } from "../lib/money.ts";

test("payment badge follows a confirmed collection before or after delivery without inventing a method", () => {
  const paid = { status: "archivado" as const, paid_at: "2026-10-29T14:00:00Z" };
  for (const [method, label] of [["cash", "Efectivo"], ["qr", "QR"], ["card", "Tarjeta"]] as const) {
    assert.equal(paymentPresentation({ ...paid, payment_method: method }).label, label);
  }
  assert.equal(paymentPresentation({ ...paid, payment_method: null }).kind, "unknown");
  assert.equal(paymentPresentation({ ...paid, paid_at: null, payment_method: "cash" }).kind, "unknown");
  assert.equal(paymentPresentation({ status: "entregado", paid_at: null, payment_method: "qr" }).kind, "unpaid");
  assert.equal(paymentPresentation({ status: "confirmado", paid_at: paid.paid_at, payment_method: "cash" }).kind, "cash");
  assert.equal(paymentPresentation({ ...paid, payment_method:"cash", payment_methods:["cash","qr"] }).label,"Efectivo + QR");
});
test("Mixed payments accept Bolivian decimals and require two positive parts of the exact total", () => {
  assert.deepEqual(splitPayment(50, "20,15"), { p_cash: 20.15, p_qr: 29.85 });
  assert.deepEqual(splitPayment("0.02", "0.01"), { p_cash: 0.01, p_qr: 0.01 });
  for (const cash of ["", "0", "-1", "50", "51", "2,001", "20e0"]) assert.equal(splitPayment(50, cash), null);
});

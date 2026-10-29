import assert from "node:assert/strict";
import test from "node:test";
import { paymentPresentation } from "../lib/payment.ts";

test("payment badge follows a confirmed closed payment without inventing a method", () => {
  const paid = { status: "archivado" as const, paid_at: "2026-10-29T14:00:00Z" };
  for (const [method, label] of [["cash", "Efectivo"], ["qr", "QR"], ["card", "Tarjeta"]] as const) {
    assert.equal(paymentPresentation({ ...paid, payment_method: method }).label, label);
  }
  assert.equal(paymentPresentation({ ...paid, payment_method: null }).kind, "unknown");
  assert.equal(paymentPresentation({ ...paid, paid_at: null, payment_method: "cash" }).kind, "unknown");
  assert.equal(paymentPresentation({ status: "entregado", paid_at: null, payment_method: "qr" }).kind, "unpaid");
  assert.equal(paymentPresentation({ status: "confirmado", paid_at: paid.paid_at, payment_method: "cash" }).kind, "unpaid");
});

// Synthetic fixture, rendered only by the environment-gated QA page.
import type { OrderSnapshot } from "./order-edit";
export const qaOrderId = "00000000-0000-4000-8000-000000009004";
export const qaOrderCatalog = [
  { id: "00000000-0000-4000-8000-000000001001", name: "Espresso QA", price: 10 },
  { id: "00000000-0000-4000-8000-000000001002", name: "Focaccia QA", price: 49 },
  { id: "00000000-0000-4000-8000-000000001003", name: "Cappuccino QA", price: 20 },
];
export function qaOrderSnapshot(): OrderSnapshot {
  return {
    order: { id: qaOrderId, order_number: "QA-P04", table_number: "QA", customer_name: "Pedido de prueba", status: "confirmado", payment_method: null, created_at: "2026-10-29T12:00:00Z", delivered_at: null, paid_at: null, total: 59, subtotal: 59, discount_bps: 0, item_count: 2, revision: 0 },
    items: qaOrderCatalog.slice(0, 2).map((product, index) => ({ id: `00000000-0000-4000-8000-00000000200${index + 1}`, order_id: qaOrderId, menu_item_id: product.id, item_name: product.name, category_name: index ? "Cocina" : "Café", quantity: 1, unit_price: product.price, line_total: product.price, net_total: product.price, status: "pending", queue_type: index ? "kitchen" : "cafe" })),
  };
}

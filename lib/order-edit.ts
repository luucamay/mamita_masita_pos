import type { OpenOrder } from "./types";

export type OrderLine = {
  id: string; order_id?: string; menu_item_id?: string | null; item_name: string; category_name: string;
  quantity: number; unit_price: number | string; line_total: number | string; net_total?: number | string;
  status: "pending" | "delivered" | "voided"; queue_type?: "cafe" | "kitchen";
};
export type EditableOrder = OpenOrder & { revision: number; subtotal?: number | string; discount_bps?: number; discount_amount?: number | string };
export type OrderSnapshot = { order: EditableOrder; items: OrderLine[] };
export type OrderChange =
  | { action: "add"; menu_item_id: string; quantity: number; expected_unit_price: number }
  | { action: "update"; order_item_id: string; quantity: number }
  | { action: "remove"; order_item_id: string };

export function normalizeOrderSnapshot(raw: { order: Record<string, unknown>; items: Record<string, unknown>[] }): OrderSnapshot {
  const items = raw.items.map((item) => ({ ...item, quantity: Number(item.quantity), unit_price: Number(item.unit_price), line_total: Number(item.line_total), net_total: Number(item.net_total ?? (item.status === "voided" ? 0 : item.line_total)) })) as OrderLine[];
  return { order: { ...raw.order, revision: Number(raw.order.revision ?? 0), total: Number(raw.order.total ?? 0), item_count: items.filter((item) => item.status !== "voided").length } as EditableOrder, items };
}

export function orderIsEditable(order: Pick<OpenOrder, "status" | "paid_at"> & Partial<Pick<OpenOrder,"payment_methods"|"delivered_at"|"purchase_type">>) {
  return ["pendiente", "confirmado", "entregado"].includes(order.status) && (!order.paid_at || Boolean(order.payment_methods?.length && order.status==="confirmado" && !order.delivered_at && order.purchase_type!=="employee"));
}

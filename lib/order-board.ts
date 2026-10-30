import { normalizeOrderSnapshot, type OrderLine } from "./order-edit.ts";
import type { OpenOrder } from "./types";
export type BoardOrder = OpenOrder & { items: OrderLine[]; revision: number };
export type OrderBoard = { orders: BoardOrder[]; selected: BoardOrder | null; serverTime: string };
export function normalizeOrderBoard(value: unknown): OrderBoard {
  const raw = value as { orders: Record<string, unknown>[]; selected: Record<string, unknown> | null; server_time: string };
  if (!raw || !Array.isArray(raw.orders) || !Number.isFinite(Date.parse(raw.server_time))) throw new Error("Respuesta de pedidos inválida");
  const normalize = (order: Record<string, unknown>): BoardOrder => {
    if (typeof order.id !== "string" || !Array.isArray(order.items)) throw new Error("Pedido inválido");
    const snapshot = normalizeOrderSnapshot({ order, items: order.items });
    return { ...snapshot.order, items: snapshot.items };
  };
  const orders = raw.orders.map(normalize);
  if (new Set(orders.map(order => order.id)).size !== orders.length) throw new Error("Pedidos duplicados");
  return { orders, selected: raw.selected ? normalize(raw.selected) : null, serverTime: raw.server_time };
}
export function elapsedLabel(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return "Sin registro";
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000), hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return `${hours ? `${String(hours).padStart(2,"0")}:` : ""}${String(minutes).padStart(2,"0")}:${String(seconds % 60).padStart(2,"0")}`;
}
export function orderDurations(order: OpenOrder, serverNow: number) {
  const start = Date.parse(order.created_at), cancelled = order.employee_cancelled_at ? Date.parse(order.employee_cancelled_at) : null;
  const closed = Boolean(order.paid_at) || ["pagado", "archivado"].includes(order.status);
  const delivered = closed || order.status === "entregado";
  const duration = (end: number | null) => Number.isFinite(start) && end !== null && Number.isFinite(end) ? Math.max(0, end-start) : null;
  return {
    preparation: duration(cancelled ?? (delivered ? order.delivered_at ? Date.parse(order.delivered_at) : null : serverNow)),
    account: duration(cancelled ?? (closed ? order.paid_at ? Date.parse(order.paid_at) : null : serverNow)),
    preparationStopped: delivered || cancelled !== null, accountStopped: closed || cancelled !== null,
  };
}

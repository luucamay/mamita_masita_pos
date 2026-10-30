import { validReportDate, reportRange } from "./report-filters.ts";
export type EmployeeSales = {
  range: { start: string; end: string; today: string }; page: number; page_size: number; total_count: number;
  summary: { orders: number; total: number; collected: number; pending: number };
  orders: { id: string; order_number: string; table_number: string; customer_name: string | null; created_at: string; status: string; paid_at: string | null; total: number; collected: number; cashiers: { id: string; name: string }[]; methods: ("cash" | "qr" | "card")[]; items: { name: string; quantity: number }[] }[];
};
export function salesRange(today: string, preset: "day" | "week" | "month") {
  const range = reportRange(preset === "day" ? "daily" : preset === "week" ? "weekly" : "monthly", today);
  const last = new Date(`${range.end}T00:00:00Z`); last.setUTCDate(last.getUTCDate() - 1);
  return { start: range.start, end: last.toISOString().slice(0, 10) };
}
export function validSalesRange(start: string, end: string) {
  return validReportDate(start) && validReportDate(end) && start <= end && (Date.parse(end) - Date.parse(start)) / 86400000 <= 365;
}
export function normalizeEmployeeSales(value: unknown): EmployeeSales {
  const v = value as EmployeeSales;
  if (!v || !v.range || !validSalesRange(v.range.start, v.range.end) || !validReportDate(v.range.today) || !Array.isArray(v.orders) || !v.summary || !Number.isInteger(v.page) || v.page < 0 || v.page_size !== 25 || !Number.isInteger(v.total_count) || v.total_count < 0) throw new Error("No se pudo verificar el historial.");
  const number = (n: unknown) => { if ((typeof n !== "string" && typeof n !== "number") || n === "" || !Number.isFinite(Number(n))) throw new Error("Importe de historial inválido."); return Number(n); };
  return { ...v, summary: { orders: number(v.summary.orders), total: number(v.summary.total), collected: number(v.summary.collected), pending: number(v.summary.pending) }, orders: v.orders.map(order => ({ ...order, total: number(order.total), collected: number(order.collected) })) };
}

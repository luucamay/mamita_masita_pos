import type { ReportFilters } from "./report-filters";
export type SalesReportRow = {
  date: string; menu_item_id?: string | null; product_or_service: string; quantity: number; unit_price: number | null; total_sale_value: number;
  payment_method: "cash" | "qr" | "card" | null; purchase_type?: "customer" | "employee"; buyer_employee_id?: string | null; order_time?: string;
};
type MethodTotal = { amount: number; orders: number };
export type SalesReport = {
  range: { period: ReportFilters["period"]; date: string; start_date: string; end_date_exclusive: string; time_zone: "America/La_Paz" };
  filters: { payment: ReportFilters["payment"]; purchase: ReportFilters["purchase"] };
  summary: { total: number; orders: number; units: number; cash: MethodTotal; qr: MethodTotal; other: MethodTotal };
  filtered: { total: number; orders: number; units: number }; rows: SalesReportRow[];
};
export function normalizeSalesReport(value: unknown): SalesReport {
  if (!value || typeof value !== "object") throw new Error("Respuesta de reporte inválida");
  const report = value as SalesReport;
  const number = (input: unknown) => {
    if (typeof input !== "number" && typeof input !== "string" || input === "" || !Number.isFinite(Number(input)) || Number(input) < 0) throw new Error("Importe de reporte inválido");
    return Number(input);
  };
  if (!report.range?.start_date || !report.summary || !report.filtered || !Array.isArray(report.rows)) throw new Error("Respuesta de reporte incompleta");
  const method = (entry: MethodTotal) => ({ amount: number(entry.amount), orders: number(entry.orders) });
  return { ...report, summary: { ...report.summary, total: number(report.summary.total), orders: number(report.summary.orders), units: number(report.summary.units), cash: method(report.summary.cash), qr: method(report.summary.qr), other: method(report.summary.other) }, filtered: { total: number(report.filtered.total), orders: number(report.filtered.orders), units: number(report.filtered.units) }, rows: report.rows.map(row => ({ ...row, quantity: number(row.quantity), unit_price: row.unit_price === null ? null : number(row.unit_price), total_sale_value: number(row.total_sale_value) })) };
}

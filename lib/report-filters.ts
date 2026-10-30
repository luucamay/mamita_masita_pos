export type ReportPeriod = "daily" | "weekly" | "monthly";
export type ReportPayment = "all" | "cash" | "qr" | "other";
export type ReportPurchase = "all" | "customer" | "employee";
export type ReportFilters = { period: ReportPeriod; date: string | null; payment: ReportPayment; purchase: ReportPurchase };
export type ReportQuery = Record<string, string | string[] | undefined>;
export function validReportDate(value: string): boolean {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function parseReportFilters(query: ReportQuery): ReportFilters {
  const period = query.period ?? "daily";
  const rawDate = query.date || null;
  // Native month inputs submit YYYY-MM; the RPC and export use its first day.
  const date = period === "monthly" && typeof rawDate === "string" && /^20\d{2}-\d{2}$/.test(rawDate) ? `${rawDate}-01` : rawDate;
  const payment = query.payment ?? "all", purchase = query.purchase ?? "all";
  if (!["daily", "weekly", "monthly"].includes(period as string) || !["all", "cash", "qr", "other"].includes(payment as string) || !["all", "customer", "employee"].includes(purchase as string) || (date !== null && (typeof date !== "string" || !validReportDate(date)))) throw new Error("Filtros inválidos. Revisa el período, la fecha y los medios de pago.");
  return { period: period as ReportPeriod, date: date as string | null, payment: payment as ReportPayment, purchase: purchase as ReportPurchase };
}
export function reportQuery(filters: ReportFilters): string {
  const params = new URLSearchParams({ period: filters.period, payment: filters.payment, purchase: filters.purchase });
  if (filters.date) params.set("date", filters.date);
  return params.toString();
}
export function reportRange(period: ReportPeriod, anchor: string) {
  if (!validReportDate(anchor)) throw new Error("Fecha inválida");
  const start = new Date(`${anchor}T00:00:00Z`);
  if (period === "weekly") start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  if (period === "monthly") start.setUTCDate(1);
  const end = new Date(start), previous = new Date(start);
  if (period === "monthly") { end.setUTCMonth(end.getUTCMonth() + 1); previous.setUTCMonth(previous.getUTCMonth() - 1); }
  else { end.setUTCDate(end.getUTCDate() + (period === "weekly" ? 7 : 1)); previous.setUTCDate(previous.getUTCDate() - (period === "weekly" ? 7 : 1)); }
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), previous: previous.toISOString().slice(0, 10), next: end.toISOString().slice(0, 10) };
}
export function reportDateLabel(value: string) {
  return new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

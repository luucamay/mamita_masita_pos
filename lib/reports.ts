import { createClient } from "@/lib/supabase/server";
import { requireRoles } from "@/lib/auth";
import { normalizeSalesReport, type SalesReport } from "@/lib/report-contract";
import type { ReportFilters } from "@/lib/report-filters";
export type { ReportPeriod } from "@/lib/report-filters";
export type { SalesReportRow } from "@/lib/report-contract";
export async function getSalesReport(filters: ReportFilters): Promise<{ report: SalesReport | null; error: string | null }> {
  await requireRoles(["admin"]);
  const { data, error } = await (await createClient()).rpc("get_sales_report", {
    p_period: filters.period, p_date: filters.date, p_payment_filter: filters.payment, p_purchase_filter: filters.purchase,
  });
  if (error) return { report: null, error: "No se pudo cargar el reporte. Intenta actualizar la página." };
  try { return { report: normalizeSalesReport(data), error: null }; }
  catch { return { report: null, error: "No se pudo verificar el reporte. Intenta actualizar la página." }; }
}

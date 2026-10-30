import { getSalesReport } from "@/lib/reports";
import { requireRoles } from "@/lib/auth";
import { parseReportFilters, type ReportQuery } from "@/lib/report-filters";
import { ReportView } from "@/components/reports/report-view";
export default async function HistorialPage({ searchParams }: { searchParams: Promise<ReportQuery> }) {
  await requireRoles(["admin"]);
  let filters;
  try { filters = parseReportFilters(await searchParams); }
  catch { return <ReportView report={null} filters={parseReportFilters({})} error="Filtros inválidos. Revisa la fecha y el período."/>; }
  const { report, error } = await getSalesReport(filters);
  return <ReportView report={report} filters={filters} error={error}/>;
}

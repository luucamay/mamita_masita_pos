import { NextResponse } from "next/server";
import { createSalesReportXlsx } from "@/lib/report-xlsx";
import { getSalesReport } from "@/lib/reports";
import { getActiveAccess } from "@/lib/auth";
import { parseReportFilters } from "@/lib/report-filters";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const access = await getActiveAccess();
  if (!access || access.profile.role !== "admin") return NextResponse.json({ error: "Acceso no autorizado" }, { status: access ? 403 : 401 });
  const params = new URL(request.url).searchParams;
  let filters;
  try {
    if (!params.has("period") || [...params.keys()].some(key => params.getAll(key).length !== 1)) throw new Error();
    filters = parseReportFilters(Object.fromEntries(params));
  } catch { return NextResponse.json({ error: "Filtros de reporte inválidos" }, { status: 400 }); }
  const { report, error } = await getSalesReport(filters);
  if (!report || error) return NextResponse.json({ error: error ?? "Reporte no disponible" }, { status: 500 });
  const filename = ["reporte-ventas", filters.period, report.range.start_date, filters.payment, filters.purchase].join("-") + ".xlsx";
  try {
    return new NextResponse(await createSalesReportXlsx(report), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="' + filename + '"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    }});
  } catch { return NextResponse.json({ error: "No se pudo generar el archivo Excel. Intenta de nuevo." }, { status: 500 }); }
}

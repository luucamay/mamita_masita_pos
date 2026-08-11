import { NextResponse } from "next/server";
import { createSalesReportCsv, reportCsvFilename } from "@/lib/report-csv";
import { getSalesReport, type ReportPeriod } from "@/lib/reports";

function isReportPeriod(value: string | null): value is ReportPeriod {
  return value === "daily" || value === "weekly" || value === "monthly";
}

export async function GET(request: Request) {
  const period = new URL(request.url).searchParams.get("period");

  if (!isReportPeriod(period)) {
    return NextResponse.json({ error: "Periodo de reporte inválido" }, { status: 400 });
  }

  const { rows, error } = await getSalesReport(period);
  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return new NextResponse(createSalesReportCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportCsvFilename(period)}"`,
      "Cache-Control": "no-store",
    },
  });
}

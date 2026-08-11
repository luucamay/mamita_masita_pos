import type { ReportPeriod, SalesReportRow } from "@/lib/reports";

const paymentLabels = {
  cash: "Efectivo",
  qr: "QR",
  card: "Tarjeta",
} as const;

export const salesReportCsvHeaders = [
  "Date",
  "Product/Service",
  "Quantity",
  "Unit Price",
  "Total Sale Value",
  "Payment Method",
] as const;

function escapeCsvValue(value: string | number) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createSalesReportCsv(rows: SalesReportRow[]) {
  const lines = rows.map((row) =>
    [
      row.date,
      row.product_or_service,
      row.quantity,
      row.unit_price,
      row.total_sale_value,
      row.payment_method ? paymentLabels[row.payment_method] : "Sin registro",
    ]
      .map(escapeCsvValue)
      .join(","),
  );

  return [salesReportCsvHeaders.join(","), ...lines].join("\r\n");
}

export function reportCsvFilename(period: ReportPeriod) {
  return `reporte-ventas-${period}.csv`;
}

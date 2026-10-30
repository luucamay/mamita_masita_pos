import ExcelJS from "exceljs";
import type { SalesReport } from "./report-contract";
import { aggregateReportProducts } from "./report-products.ts";

const currencyFormat = '"Bs "#,##0.00';
const palette = { ink: "FF292524", orange: "FFC2410C", header: "FFFED7AA", cream: "FFFFF7ED", border: "FFE7DED5" };
const payments = { all: "Todos", cash: "Efectivo", qr: "QR", other: "Otros (tarjeta)" };
const purchases = { all: "Clientes y empleados", customer: "Clientes", employee: "Empleados" };
const date = (value: string) => new Date(`${value}T00:00:00Z`);
const text = (value: string) => { if (value.length > 32767) throw new Error("Un nombre supera el límite de Excel"); return value; };

export async function createSalesReportXlsx(report: SalesReport): Promise<Uint8Array<ArrayBuffer>> {
  const products = aggregateReportProducts(report.rows);
  if (products.reduce((sum, item) => sum + Math.round(item.income * 100), 0) !== Math.round(report.filtered.total * 100) || products.reduce((sum, item) => sum + item.quantity, 0) !== report.filtered.units) throw new Error("El detalle no concilia con el reporte");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mamita Masita";
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet("Ventas", { properties: { tabColor: { argb: palette.orange } }, views: [{ state: "frozen", ySplit: 13, showGridLines: false }], pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  sheet.columns = [{ width: 45 }, { width: 16 }, { width: 25 }, { width: 18 }, { width: 26 }];
  sheet.mergeCells("A2:E2"); sheet.getCell("A2").value = "Mamita Masita"; sheet.getCell("A2").font = { name: "Arial", size: 20, bold: true, color: { argb: palette.orange } }; sheet.getRow(2).height = 32;
  sheet.mergeCells("A3:E3"); sheet.getCell("A3").value = `Reporte ${report.range.period === "daily" ? "diario" : report.range.period === "weekly" ? "semanal" : "mensual"} de ventas`;
  sheet.getCell("A5").value = "Desde"; sheet.getCell("B5").value = date(report.range.start_date); sheet.getCell("B5").numFmt = "dd/mm/yyyy";
  const lastDay = date(report.range.end_date_exclusive); lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  sheet.getCell("C5").value = "Hasta"; sheet.getCell("D5").value = lastDay; sheet.getCell("D5").numFmt = "dd/mm/yyyy"; sheet.getCell("E5").value = "Bolivia";
  sheet.getCell("A6").value = "Medio de pago"; sheet.mergeCells("B6:E6"); sheet.getCell("B6").value = payments[report.filters.payment];
  sheet.getCell("A7").value = "Tipo de compra"; sheet.mergeCells("B7:E7"); sheet.getCell("B7").value = purchases[report.filters.purchase];
  sheet.mergeCells("A8:E8"); sheet.getCell("A8").value = "Por fecha de cobro. Ingresos netos con descuentos aplicados.";
  sheet.getCell("A10").value = "Ingreso exportado"; sheet.getCell("C10").value = report.filtered.total; sheet.getCell("C10").numFmt = currencyFormat;
  sheet.getCell("D10").value = "Pedidos"; sheet.getCell("E10").value = report.filtered.orders;
  for (const address of ["C5", "E5", "D10"]) sheet.getCell(address).alignment = { horizontal: "left", indent: 1 };
  sheet.getCell("A11").value = "Unidades vendidas"; sheet.getCell("C11").value = report.filtered.units; sheet.getCell("C11").numFmt = "#,##0";

  function table(name: string, headerRow: number, headers: string[], rows: (string | number)[][]) {
    if (rows.length) sheet.addTable({ name, ref: `A${headerRow}`, headerRow: true, totalsRow: true, style: { theme: "TableStyleLight1", showRowStripes: false }, columns: headers.map((name, index) => ({ name, filterButton: true, ...(index === 0 ? { totalsRowLabel: "TOTAL" } : index === 1 || index === 2 ? { totalsRowFunction: "custom" as const, totalsRowFormula: `SUM(${index === 1 ? "B" : "C"}${headerRow + 1}:${index === 1 ? "B" : "C"}${headerRow + rows.length})` } : { totalsRowFunction: "none" as const }) })), rows });
    else sheet.getRow(headerRow).values = headers;
    const header = sheet.getRow(headerRow); header.height = 28;
    headers.forEach((_, i) => { const cell = header.getCell(i + 1); cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: palette.header } }; cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FF7C2D12" } }; cell.alignment = { vertical: "middle", horizontal: i === 1 || i === 2 ? "right" : "left", indent: i > 2 ? 1 : 0 }; });
    rows.forEach((row, index) => {
      const target = sheet.getRow(headerRow + index + 1); target.height = Math.max(25, Math.ceil(String(row[0]).length / 43) * 16 + 8);
      row.forEach((_, column) => { const cell = target.getCell(column + 1); cell.font = { name: "Arial", size: 11, color: { argb: palette.ink } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "FFFFFFFF" : palette.cream } }; cell.alignment = { vertical: "middle", horizontal: column === 1 || column === 2 ? "right" : "left", indent: column > 2 ? 1 : 0, wrapText: true }; if (column === 1) cell.numFmt = "#,##0"; if (column === 2) cell.numFmt = currencyFormat; });
    });
    if (rows.length) {
      const total = headerRow + rows.length + 1; sheet.getCell(`A${total}`).value = "TOTAL";
      for (const [column, index] of [["B", 1], ["C", 2]] as const) {
        sheet.getCell(`${column}${total}`).value = { formula: `SUM(${column}${headerRow + 1}:${column}${headerRow + rows.length})`, result: rows.reduce((sum, row) => sum + Math.round(Number(row[index]) * 100), 0) / 100 };
        sheet.getCell(`${column}${total}`).numFmt = index === 1 ? "#,##0" : currencyFormat;
      }
      sheet.getRow(total).height = 26;
      for (let column = 1; column <= headers.length; column++) { const cell = sheet.getRow(total).getCell(column); cell.font = { name: "Arial", bold: true, color: { argb: palette.orange } }; cell.border = { top: { style: "thin", color: { argb: palette.orange } } }; }
    }
  }
  table("VentasPorItem", 13, ["Ítem", "Cantidad", "Ingreso total"], products.map(item => [text(item.name), item.quantity, item.income]));
  const lastProduct = 13 + products.length;
  const totalRow = lastProduct + 1;
  sheet.getCell(`A${totalRow}`).value = "TOTAL";
  sheet.getCell(`B${totalRow}`).value = products.length ? { formula: `SUM(B14:B${lastProduct})`, result: report.filtered.units } : 0;
  sheet.getCell(`C${totalRow}`).value = products.length ? { formula: `SUM(C14:C${lastProduct})`, result: report.filtered.total } : 0;
  sheet.getCell(`B${totalRow}`).numFmt = "#,##0"; sheet.getCell(`C${totalRow}`).numFmt = currencyFormat;
  for (const cell of [sheet.getCell(`A${totalRow}`), sheet.getCell(`B${totalRow}`), sheet.getCell(`C${totalRow}`)]) { cell.font = { name: "Arial", bold: true, color: { argb: palette.orange } }; cell.border = { top: { style: "thin", color: { argb: palette.orange } } }; }
  if (!products.length) { sheet.mergeCells(`A${totalRow + 2}:E${totalRow + 2}`); sheet.getCell(`A${totalRow + 2}`).value = "Sin ventas cobradas para los filtros seleccionados."; }
  const detailTitle = totalRow + 4, detailHeader = detailTitle + 1;
  sheet.mergeCells(`A${detailTitle}:E${detailTitle}`); sheet.getCell(`A${detailTitle}`).value = "Desglose por medio de pago y tipo de compra"; sheet.getCell(`A${detailTitle}`).font = { name: "Arial", bold: true, color: { argb: palette.orange } };
  table("DesgloseVentas", detailHeader, ["Ítem", "Cantidad", "Ingreso neto", "Pago", "Tipo de compra"], report.rows.map(row => [text(row.product_or_service), row.quantity, row.total_sale_value, row.payment_method === "cash" ? "Efectivo" : row.payment_method === "qr" ? "QR" : row.payment_method === "card" ? "Tarjeta" : "Sin registro", row.purchase_type === "employee" ? "Compra de empleado" : "Cliente"]));
  sheet.eachRow(row => { if (!row.height) row.height = 23; row.eachCell(cell => { if (!cell.font?.name) cell.font = { name: "Arial", size: 11, color: { argb: palette.ink } }; }); });
  sheet.pageSetup.printArea = `A1:E${detailHeader + report.rows.length + (report.rows.length ? 1 : 0)}`;
  sheet.pageSetup.printTitlesRow = "1:13";
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

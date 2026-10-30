import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SalesReport } from "./report-contract";
import { aggregateReportProducts } from "./report-products.ts";

const currencyFormat = '"Bs "#,##0.00;[Red]-"Bs "#,##0.00';
const palette = { ink: "FF292524", orange: "FFB75800", header: "FFFED7AA", cream: "FFFFF7ED", border: "FFE7DED5" };
const payments = { all: "Todos", cash: "Efectivo", qr: "QR", other: "Otros (tarjeta)" };
const purchases = { all: "Clientes y empleados", customer: "Clientes", employee: "Empleados" };
const date = (value: string) => new Date(`${value}T00:00:00Z`);
const text = (value: string) => { if (value.length > 32767) throw new Error("Un nombre supera el límite de Excel"); return value; };
const HEADER_ROW = 8;

export async function createSalesReportXlsx(report: SalesReport): Promise<Uint8Array<ArrayBuffer>> {
 const products = aggregateReportProducts(report.rows);
 if (products.reduce((sum, item) => sum + Math.round(item.income * 100), 0) !== Math.round(report.filtered.total * 100) || products.reduce((sum, item) => sum + item.quantity, 0) !== report.filtered.units) throw new Error("El detalle no concilia con el reporte");
 const workbook = new ExcelJS.Workbook();
 workbook.creator = "Mamita Masita"; workbook.calcProperties.fullCalcOnLoad = true;
 const logo = workbook.addImage({ base64: "data:image/png;base64," + (await readFile(join(process.cwd(), "public/icons/icon-192.png"))).toString("base64"), extension: "png" });
 const lastDay = date(report.range.end_date_exclusive); lastDay.setUTCDate(lastDay.getUTCDate() - 1);
 const period = report.range.period === "daily" ? "diario" : report.range.period === "weekly" ? "semanal" : "mensual";
 function sheet(name: string, widths: number[], detail = false) {
  const ws = workbook.addWorksheet(name, { properties: { tabColor: { argb: detail ? palette.header : palette.orange } }, views: [{ state: "frozen", ySplit: HEADER_ROW, showGridLines: false }], pageSetup: { paperSize: 9, orientation: detail ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.35, bottom: 0.35, header: 0.1, footer: 0.1 } } });
  ws.columns = widths.map(width => ({ width }));
  const lastColumn = String.fromCharCode(64 + widths.length);
  ws.mergeCells(`A1:${lastColumn}1`); ws.getCell("A1").value = "Mamita Masita";
  ws.getCell("A1").font = { name: "Arial", size: 16, bold: true, color: { argb: palette.orange } };
  ws.getCell("A1").alignment = { vertical: "middle" };
  ws.getRow(1).height = 26;
  ws.mergeCells(`A2:${lastColumn}2`); ws.getCell("A2").value = detail ? `Desglose del reporte ${period}` : `Reporte ${period} de ventas`;
  ws.getCell("A2").alignment = { vertical: "middle" }; ws.getRow(2).height = 19;
  ws.addImage(logo, { tl: { col: widths.length - 0.5, row: 0 }, ext: { width: 52, height: 52 }, editAs: "absolute" });
  ws.getCell("A3").value = "Desde / hasta (Bolivia, por cobro)";
  ws.getCell("B3").value = date(report.range.start_date); ws.getCell("C3").value = lastDay;
  for (const cell of ["B3", "C3"]) { ws.getCell(cell).numFmt = "dd/mm/yyyy"; ws.getCell(cell).alignment = { horizontal: "right", vertical: "middle" }; }
  ws.mergeCells(`A4:${lastColumn}4`); ws.getCell("A4").value = `Pagos: ${payments[report.filters.payment]}. Compras: ${purchases[report.filters.purchase]}.`;
  ws.getCell("A4").font = { name: "Arial", size: 10, color: { argb: "FF6F6962" } };
  ws.getRow(3).height = 20; ws.getRow(4).height = 20; ws.getRow(5).height = 21; ws.getRow(6).height = 27; ws.getRow(7).height = 7;
  ["Ingreso neto", "Pedidos", "Unidades"].forEach((label, index) => { const cell = ws.getRow(5).getCell(index + 1); cell.value = label; cell.font = { name: "Arial", size: 10, bold: true, color: { argb: palette.orange } }; });
  for (const row of [5, 6]) for (let col = 1; col <= 3; col++) {
   const cell = ws.getRow(row).getCell(col); cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: palette.cream } };
   cell.alignment = { horizontal: col === 1 ? "left" : "right", vertical: "middle", indent: 1 };
   if (row === 6) cell.font = { name: "Arial", size: 16, bold: true, color: { argb: palette.ink } };
  }
  ws.getCell("A6").numFmt = currencyFormat; ws.getCell("B6").numFmt = ws.getCell("C6").numFmt = "#,##0";
  ws.pageSetup.printTitlesRow = `1:${HEADER_ROW}`;
  return ws;
 }
 function table(ws: ExcelJS.Worksheet, name: string, headers: string[], rows: (string | number)[][]) {
  const first = HEADER_ROW + 1, last = HEADER_ROW + rows.length, total = last + 1;
  if (rows.length) ws.addTable({ name, ref: `A${HEADER_ROW}`, headerRow: true, totalsRow: true, style: { theme: "TableStyleLight1", showRowStripes: false }, columns: headers.map((name, index) => ({ name, filterButton: true, ...(index === 0 ? { totalsRowLabel: "TOTAL" } : index === 1 || index === 2 ? { totalsRowFunction: "custom" as const, totalsRowFormula: `SUM(${index === 1 ? "B" : "C"}${first}:${index === 1 ? "B" : "C"}${last})` } : { totalsRowFunction: "none" as const }) })), rows });
  else ws.getRow(HEADER_ROW).values = headers;
  ws.getRow(HEADER_ROW).height = 27;
  headers.forEach((_, index) => { const cell = ws.getRow(HEADER_ROW).getCell(index + 1); cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: palette.header } }; cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF7C2D12" } }; cell.alignment = { vertical: "middle", horizontal: "center" }; });
  rows.forEach((row, index) => {
   const target = ws.getRow(first + index); target.height = Math.max(22, Math.ceil(String(row[0]).length / 43) * 14 + 6);
   row.forEach((_, column) => {
    const cell = target.getCell(column + 1);
    cell.font = { name: "Arial", size: 10, color: { argb: palette.ink } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? "FFFFFFFF" : palette.cream } };
    cell.alignment = { vertical: "middle", horizontal: column === 1 || column === 2 ? "right" : "left", indent: column > 2 ? 1 : 0, wrapText: true };
    if (column === 1) cell.numFmt = "#,##0";
    if (column === 2) cell.numFmt = currencyFormat;
   });
  });
  ws.getCell(`A${total}`).value = "TOTAL"; ws.getRow(total).height = 25;
  for (const [column, index] of [["B", 1], ["C", 2]] as const) {
   ws.getCell(`${column}${total}`).value = rows.length ? { formula: `SUM(${column}${first}:${column}${last})`, result: rows.reduce((sum, row) => sum + Math.round(Number(row[index]) * 100), 0) / 100 } : 0;
   ws.getCell(`${column}${total}`).numFmt = index === 1 ? "#,##0" : currencyFormat;
  }
  for (let col = 1; col <= headers.length; col++) { const cell = ws.getRow(total).getCell(col); cell.font = { name: "Arial", size: 10, bold: true, color: { argb: palette.orange } }; cell.border = { top: { style: "thin", color: { argb: palette.orange } } }; cell.alignment = { horizontal: col === 2 || col === 3 ? "right" : "left", vertical: "middle" }; }
  if (!rows.length) { ws.mergeCells(`A${total + 2}:${String.fromCharCode(64 + headers.length)}${total + 2}`); ws.getCell(`A${total + 2}`).value = "Sin ventas cobradas para los filtros seleccionados."; }
  ws.pageSetup.printArea = `A1:${String.fromCharCode(64 + headers.length)}${total + (rows.length ? 0 : 2)}`;
  return total;
 }
 const main = sheet("Ventas", [46, 18, 24]);
 const totalRow = table(main, "VentasPorItem", ["Ítem", "Cantidad", "Ingreso total"], products.map(item => [text(item.name), item.quantity, item.income]));
 main.getCell("A6").value = { formula: `C${totalRow}`, result: report.filtered.total };
 main.getCell("B6").value = report.filtered.orders;
 main.getCell("C6").value = { formula: `B${totalRow}`, result: report.filtered.units };
 const detail = sheet("Desglose", [46, 14, 23, 14, 24], true);
 table(detail, "DesgloseVentas", ["Ítem", "Cantidad", "Ingreso neto", "Pago", "Tipo de compra"], report.rows.map(row => [text(row.product_or_service), row.quantity, row.total_sale_value, row.payment_method === "cash" ? "Efectivo" : row.payment_method === "qr" ? "QR" : row.payment_method === "card" ? "Tarjeta" : "Sin registro", row.purchase_type === "employee" ? "Compra de empleado" : "Cliente"]));
 for (const [cell, result] of [["A6", report.filtered.total], ["B6", report.filtered.orders], ["C6", report.filtered.units]] as const) detail.getCell(cell).value = { formula: `'Ventas'!${cell}`, result };
 for (const ws of [main, detail]) ws.eachRow(row => row.eachCell(cell => {
  if (!cell.font?.name) cell.font = { name: "Arial", size: 10, color: { argb: palette.ink } };
  if (!cell.alignment?.vertical) cell.alignment = { ...cell.alignment, vertical: "middle" };
 }));
 const buffer = await workbook.xlsx.writeBuffer();
 return new Uint8Array(buffer as ArrayBuffer);
}

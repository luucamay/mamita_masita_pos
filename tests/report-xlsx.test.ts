import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { createSalesReportXlsx } from "../lib/report-xlsx.ts";
import type { SalesReport } from "../lib/report-contract.ts";
function report(): SalesReport {
  return { range: { period: "daily", date: "2026-10-17", start_date: "2026-10-17", end_date_exclusive: "2026-10-18", time_zone: "America/La_Paz" }, filters: { payment: "all", purchase: "all" }, summary: { total: 63, orders: 4, units: 5, cash: { amount: 26, orders: 2 }, qr: { amount: 37, orders: 2 }, other: { amount: 0, orders: 0 } }, filtered: { total: 63, orders: 4, units: 5 }, rows: [
    { date: "2026-10-17", menu_item_id: "espresso", product_or_service: "Café pequeño", quantity: 1, unit_price: 10, total_sale_value: 10, payment_method: "cash", purchase_type: "customer" },
    { date: "2026-10-17", menu_item_id: "cappuccino", product_or_service: "Cappuccino", quantity: 2, unit_price: 20, total_sale_value: 34, payment_method: "qr", purchase_type: "customer" },
    { date: "2026-10-17", menu_item_id: "cappuccino", product_or_service: "Cappuccino", quantity: 1, unit_price: 20, total_sale_value: 16, payment_method: "cash", purchase_type: "employee" },
    { date: "2026-10-17", menu_item_id: "literal", product_or_service: '=HYPERLINK("https://invalid.test")', quantity: 1, unit_price: 3, total_sale_value: 3, payment_method: "qr", purchase_type: "customer" },
  ] };
}
async function open(input: SalesReport) {
  const bytes = await createSalesReportXlsx(input); assert.equal(Buffer.from(bytes).subarray(0, 2).toString(), "PK");
  const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes.buffer); return book;
}

test("Refund Excel keeps negative units and net cash values as numeric cells",async()=>{
  const value=report();value.rows=[{...value.rows[0],quantity:-1,total_sale_value:-10}];value.filtered={total:-10,orders:1,units:-1};value.summary={total:-10,orders:1,units:-1,cash:{amount:-10,orders:1},qr:{amount:0,orders:0},other:{amount:0,orders:0}};
  const book=await open(value),sheet=book.getWorksheet("Ventas")!;assert.equal(sheet.getCell("C10").value,-10);assert.equal(sheet.getCell("B14").value,-1);assert.equal(sheet.getCell("C14").value,-10);
});
test("P12 creates real XLSX with one styled sheet, numeric amounts, totals and dates", async () => {
  const book = await open(report()), sheet = book.getWorksheet("Ventas")!;
  assert.equal(book.worksheets.length, 1); assert.equal(sheet.getCell("C10").value, 63); assert.equal(sheet.getCell("B5").value instanceof Date, true);
  assert.equal(sheet.getCell("B14").type, ExcelJS.ValueType.Number); assert.equal(sheet.getCell("C14").type, ExcelJS.ValueType.Number);
  assert.equal(sheet.getCell("C17").formula, "SUM(C14:C16)"); assert.equal(sheet.getCell("C17").result, 63);
  assert.equal(sheet.getCell("A13").fill.type, "pattern"); assert.equal(sheet.views[0].state, "frozen"); assert.equal(sheet.getTable("VentasPorItem").name, "VentasPorItem");
});
test("P12 text beginning with equals stays literal and employee income remains identifiable", async () => {
  const sheet = (await open(report())).getWorksheet("Ventas")!;
  const names: ExcelJS.Cell[] = []; sheet.eachRow(row => names.push(row.getCell(1)));
  const literal = names.find(cell => cell.value === '=HYPERLINK("https://invalid.test")')!; assert(literal); assert.equal(literal.type, ExcelJS.ValueType.String); assert.equal(literal.formula, undefined);
  const cappuccino = names.find(cell => cell.value === "Cappuccino")!; assert.equal(sheet.getCell(cappuccino.row, 2).value, 3); assert.equal(sheet.getCell(cappuccino.row, 3).value, 50);
  assert(names.some(cell => cell.value === "Café pequeño")); assert(sheet.getColumn(5).values.includes("Compra de empleado"));
});
test("P12 empty periods export labeled zero totals without invented sales", async () => {
  const input = report(); input.rows = []; input.filtered = { total: 0, units: 0, orders: 0 };
  const sheet = (await open(input)).getWorksheet("Ventas")!; assert.equal(sheet.getCell("C10").value, 0); assert.equal(sheet.getCell("C14").value, 0); assert.equal(sheet.getCell("A16").value, "Sin ventas cobradas para los filtros seleccionados.");
});
test("P12 preserves over 1000 products and centavo totals", async () => {
  const input = report(); input.rows = Array.from({ length: 1005 }, (_, i) => ({ ...input.rows[0], menu_item_id: `id${i}`, product_or_service: `Ítem ${i}`, quantity: 1, total_sale_value: 0.01 })); input.filtered = { total: 10.05, orders: 1, units: 1005 };
  const sheet = (await open(input)).getWorksheet("Ventas")!; assert.equal(sheet.getCell("C1019").result, 10.05); assert.equal(new Set(sheet.getRows(14, 1005)!.map(row => row.getCell(1).value)).size, 1005);
});
test("P12 rejects a mismatch between the exported lines and filtered revenue", async () => {
  const input = report(); input.filtered.total = 100; await assert.rejects(() => createSalesReportXlsx(input), /no concilia/);
});

import type { SalesReportRow } from "./report-contract";
export type ProductSales = {
  key: string; menuItemId: string | null; name: string; quantity: number; income: number;
  employeeQuantity: number; employeeIncome: number;
};
export function aggregateReportProducts(rows: SalesReportRow[]): ProductSales[] {
  const groups = new Map<string, ProductSales & { cents: number; employeeCents: number }>();
  for (const row of rows) {
    const key = JSON.stringify([row.menu_item_id ?? null, row.product_or_service]);
    const cents = Math.round(row.total_sale_value * 100);
    if (!Number.isSafeInteger(cents) || !Number.isSafeInteger(row.quantity)) throw new Error("Datos de producto inválidos");
    const item = groups.get(key) ?? { key, menuItemId: row.menu_item_id ?? null, name: row.product_or_service, quantity: 0, income: 0, employeeQuantity: 0, employeeIncome: 0, cents: 0, employeeCents: 0 };
    item.quantity += row.quantity; item.cents += cents;
    if (row.purchase_type === "employee") { item.employeeQuantity += row.quantity; item.employeeCents += cents; }
    if (!Number.isSafeInteger(item.cents) || !Number.isSafeInteger(item.quantity)) throw new Error("El reporte excede el rango permitido");
    groups.set(key, item);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "es") || a.key.localeCompare(b.key)).map(({ cents, employeeCents, ...item }) => ({ ...item, income: cents / 100, employeeIncome: employeeCents / 100 }));
}

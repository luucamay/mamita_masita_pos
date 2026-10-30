import type { SalesReportRow } from "@/lib/report-contract";
import { aggregateReportProducts } from "@/lib/report-products";
const money = (value: number) => new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(value);
export function ProductSalesTable({ rows }: { rows: SalesReportRow[] }) {
  const products = aggregateReportProducts(rows);
  return <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
    <table data-testid="product-summary" className="w-full table-fixed text-left text-sm"><caption className="sr-only">Ventas por producto</caption><thead className="border-b border-[var(--border)] bg-stone-50 text-[var(--muted)]"><tr><th scope="col" className="w-[46%] px-4 py-3">Ítem</th><th scope="col" className="w-[20%] px-2 py-3 text-right">Cantidad</th><th scope="col" className="w-[34%] px-4 py-3 text-right">Ingreso total</th></tr></thead>
      <tbody className="divide-y divide-[var(--border)]">{products.map(item => <tr key={item.key}><th scope="row" className="break-words px-4 py-3 font-medium">{item.name}{item.employeeQuantity > 0 ? <span className="mt-1 block text-xs font-normal text-violet-800">Compra de empleado: {item.employeeQuantity} {item.employeeQuantity === 1 ? "unidad" : "unidades"}, {money(item.employeeIncome)}</span> : null}</th><td className="px-2 py-3 text-right align-top tabular-nums">{item.quantity}</td><td className="break-words px-4 py-3 text-right align-top font-semibold tabular-nums">{money(item.income)}</td></tr>)}</tbody>
    </table>
    {!products.length ? <p className="px-5 py-10 text-center text-sm text-[var(--muted)]">No hay ventas cobradas con estos filtros.</p> : null}
  </div>;
}

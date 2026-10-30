import type { SalesReport } from "@/lib/report-contract";
const money = (value: number) => new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(value);
export function ReportSummary({ report }: { report: SalesReport }) {
  const { summary, range, filters } = report;
  const totalLabel = range.period === "daily" ? "Total del día" : range.period === "weekly" ? "Total de la semana" : "Total del mes";
  const purchaseLabel = filters.purchase === "employee" ? "Compras de empleados" : filters.purchase === "customer" ? "Compras de clientes" : "Clientes y empleados";
  const orders = (value: number) => `${value} ${value === 1 ? "pedido" : "pedidos"}`;
  return <section aria-label="Resumen de caja" className="space-y-3">
    <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[var(--border)] bg-white lg:grid-cols-3">
      <div data-testid="summary-total" className="col-span-2 border-b border-[var(--border)] bg-orange-50 px-3 py-3 lg:col-span-1 lg:border-r lg:border-b-0"><dt className="font-semibold text-orange-950">{totalLabel}</dt><dd className="mt-1 text-3xl font-semibold tabular-nums text-orange-950">{money(summary.total)}</dd><dd className="mt-2 text-sm text-orange-900">{orders(summary.orders)} · {summary.units} {summary.units === 1 ? "unidad" : "unidades"}</dd></div>
      <div data-testid="summary-cash" className="border-r border-[var(--border)] px-3 py-3"><dt className="text-sm font-medium text-[var(--muted)]">Efectivo</dt><dd className="mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl">{money(summary.cash.amount)}</dd><dd className="mt-2 text-sm text-[var(--muted)]">{orders(summary.cash.orders)}</dd></div>
      <div data-testid="summary-qr" className="px-3 py-3"><dt className="text-sm font-medium text-[var(--muted)]">QR</dt><dd className="mt-1 break-words text-xl font-semibold tabular-nums sm:text-2xl">{money(summary.qr.amount)}</dd><dd className="mt-2 text-sm text-[var(--muted)]">{orders(summary.qr.orders)}</dd></div>
    </dl>
    {summary.other.orders > 0 ? <p data-testid="summary-other" className="text-sm">Otros (tarjeta): <strong>{money(summary.other.amount)}</strong> · {orders(summary.other.orders)}. Incluido en el total.</p> : null}
    <p className="text-xs text-[var(--muted)]">{purchaseLabel} · Por fecha de cobro.{filters.payment !== "all" ? " El filtro de pago cambia el detalle; el resumen conserva todos los medios." : ""}</p>
  </section>;
}

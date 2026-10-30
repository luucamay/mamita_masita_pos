import type { SalesReport } from "@/lib/report-contract";
import { reportQuery, reportRange, reportDateLabel, validReportDate, type ReportFilters } from "@/lib/report-filters";
import { EmployeePurchaseBadge } from "@/components/orders/employee-purchase-badge";
import { ReportSummary } from "./report-summary";
import { ProductSalesTable } from "./product-sales-table";

const periods = [{ value: "daily", label: "Diario" }, { value: "weekly", label: "Semanal" }, { value: "monthly", label: "Mensual" }] as const;
const money = (value: number) => new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(value);
const methods = { cash: "Efectivo", qr: "QR", card: "Tarjeta" };

export function ReportView({ report, filters, error = null }: { report: SalesReport | null; filters: ReportFilters; error?: string | null }) {
  const active = { ...filters, date: report?.range.date ?? filters.date };
  const range = active.date ? reportRange(active.period, active.date) : null;
  const lastDay = range ? new Date(`${range.end}T00:00:00Z`) : null;
  lastDay?.setUTCDate(lastDay.getUTCDate() - 1);
  const href = (changes: Partial<ReportFilters>) => `/historial?${reportQuery({ ...active, ...changes })}`;
  return <div className="mx-auto max-w-7xl space-y-6 px-5 py-6 sm:px-8">
    <header className="flex flex-wrap justify-between gap-4 sm:items-center">
      <div><h1 className="text-2xl font-semibold">Historial y reportes</h1><p className="mt-2 text-sm text-[var(--muted)]">Cobros netos, incluidas devoluciones y compras de empleados.</p></div>
      <nav aria-label="Período del reporte" className="flex w-fit rounded-xl border border-[var(--border)] bg-white p-1">{periods.map(period => <a key={period.value} href={href({ period: period.value })} aria-current={active.period === period.value ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold ${active.period === period.value ? "bg-orange-500 text-white" : "text-[var(--muted)] hover:bg-orange-50"}`}>{period.label}</a>)}</nav>
      <a href="/menu" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white">Tomar pedido</a>
    </header>
    {range && lastDay ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm" data-testid="report-range"><strong>{reportDateLabel(range.start)}{range.start !== lastDay.toISOString().slice(0, 10) ? ` al ${reportDateLabel(lastDay.toISOString().slice(0, 10))}` : ""}</strong> · Bolivia · por fecha de cobro</p><div className="flex gap-4">{validReportDate(range.previous) ? <a href={href({ date: range.previous })} className="inline-flex min-h-11 items-center text-sm font-semibold text-orange-800">Anterior</a> : null}{validReportDate(range.next) ? <a href={href({ date: range.next })} className="inline-flex min-h-11 items-center text-sm font-semibold text-orange-800">Siguiente</a> : null}</div></div> : null}
    {report ? <ReportSummary report={report}/> : null}
    <form action="/historial" className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--border)] bg-white p-4">
      <input type="hidden" name="period" value={active.period}/>
      <label className="min-w-0 text-sm">Fecha de referencia<input type="date" name="date" required min="2000-01-01" max="2099-12-31" defaultValue={active.date ?? ""} key={active.date} className="mt-1 block min-h-11 max-w-full rounded-xl border border-[var(--border)] px-3"/></label>
      <label className="text-sm">Medio de pago del detalle<select name="payment" defaultValue={active.payment} key={active.payment} className="mt-1 block min-h-11 rounded-xl border border-[var(--border)] bg-white px-3"><option value="all">Todos</option><option value="cash">Efectivo</option><option value="qr">QR</option><option value="other">Otros (tarjeta)</option></select></label>
      <label className="text-sm">Tipo de compra<select name="purchase" defaultValue={active.purchase} key={active.purchase} className="mt-1 block min-h-11 rounded-xl border border-[var(--border)] bg-white px-3"><option value="all">Todas las compras</option><option value="customer">Clientes</option><option value="employee">Empleados</option></select></label>
      <button type="submit" className="min-h-11 rounded-xl bg-orange-500 px-5 font-semibold text-white">Aplicar filtros</button>
      <a href={href({ date: null })} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-orange-800">Hoy</a>
    </form>
    {error ? <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error} <a href="/historial" className="font-semibold underline">Volver al reporte de hoy</a></div> : null}
    {report ? <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
        <div><h2 className="text-lg font-semibold">Detalle por producto</h2><p className="mt-1 text-sm text-[var(--muted)]" data-testid="filtered-total">{money(report.filtered.total)} · {report.filtered.orders} pedidos · {report.filtered.units} unidades con los filtros del detalle.</p></div>
        <a href={`/historial/export?${reportQuery(active)}`} download className="inline-flex min-h-11 items-center rounded-xl border border-orange-200 bg-orange-50 px-4 text-sm font-semibold text-orange-800">Exportar Excel</a>
      </div>
      <ProductSalesTable rows={report.rows}/>
      <details className="space-y-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-orange-800">Ver desglose por pago y tipo de compra</summary>
      <p className="text-sm text-[var(--muted)]">El desglose conserva medio de pago y tipo de compra. “Varios” indica distintos precios históricos.</p>
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white"><div className="overflow-x-auto" role="region" aria-label="Productos vendidos" tabIndex={0}>
        <table className="w-full min-w-[670px] text-left text-sm"><caption className="sr-only">Productos vendidos del período seleccionado, con ingresos netos cobrados</caption><thead className="border-b border-[var(--border)] bg-stone-50 text-[var(--muted)]"><tr><th className="px-4 py-3">Producto</th><th className="px-4 py-3 text-right">Cantidad</th><th className="px-4 py-3 text-right">Precio base unitario</th><th className="px-4 py-3 text-right">Ingreso neto</th><th className="px-4 py-3">Pago</th><th className="px-4 py-3">Compra</th></tr></thead><tbody className="divide-y divide-[var(--border)]">{report.rows.map((row, index) => <tr key={`${row.menu_item_id}-${row.product_or_service}-${row.payment_method}-${row.purchase_type}-${index}`}><td className="px-4 py-3 font-medium">{row.product_or_service}</td><td className="px-4 py-3 text-right tabular-nums">{row.quantity}</td><td className="px-4 py-3 text-right tabular-nums">{row.unit_price === null ? "Varios" : money(row.unit_price)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{money(row.total_sale_value)}</td><td className="px-4 py-3">{row.payment_method ? methods[row.payment_method] : "Sin registro"}</td><td className="px-4 py-3">{row.purchase_type === "employee" ? <EmployeePurchaseBadge/> : "Cliente"}</td></tr>)}</tbody></table>
      </div></div>
      </details>
    </> : null}
  </div>;
}

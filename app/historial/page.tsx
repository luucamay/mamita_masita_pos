import Link from "next/link";
import { getSalesReport, type ReportPeriod } from "@/lib/reports";

const periods: { value: ReportPeriod; label: string }[] = [
  { value: "daily", label: "Diario" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensual" },
];

const paymentLabels = {
  cash: "Efectivo",
  qr: "QR",
  card: "Tarjeta",
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
  }).format(value);
}

function formatDate(value: string, period: ReportPeriod) {
  return new Intl.DateTimeFormat("es-BO", {
    day: period === "daily" ? "2-digit" : undefined,
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/La_Paz",
  }).format(new Date(value));
}

export default async function HistorialPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const requestedPeriod = (await searchParams).period;
  const period: ReportPeriod =
    requestedPeriod === "weekly" || requestedPeriod === "monthly" ? requestedPeriod : "daily";
  const { rows, error } = await getSalesReport(period);
  const totalSales = rows.reduce((sum, row) => sum + row.total_sale_value, 0);
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);

  return (
    <div className="px-5 py-6 sm:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-orange-500">Ventas</p>
          <h1 className="mt-1 text-2xl font-semibold">Historial y reportes</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Resumen de pedidos pagados por producto y método de pago.
          </p>
        </div>
        <div className="flex rounded-xl border border-[var(--border)] bg-white p-1">
          {periods.map((item) => (
            <Link
              key={item.value}
              href={`/historial?period=${item.value}`}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                period === item.value ? "bg-orange-500 text-white" : "text-[var(--muted)] hover:bg-orange-50"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-sm text-[var(--muted)]">Venta total</p>
          <p className="mt-1 text-2xl font-semibold">{formatMoney(totalSales)}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-sm text-[var(--muted)]">Unidades vendidas</p>
          <p className="mt-1 text-2xl font-semibold">{totalQuantity}</p>
        </div>
      </div>

      {error ? (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-[var(--border)] bg-gray-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fecha</th>
                  <th className="px-4 py-3 font-semibold">Hora</th>
                  <th className="px-4 py-3 font-semibold">Producto / Servicio</th>
                  <th className="px-4 py-3 text-right font-semibold">Cantidad</th>
                  <th className="px-4 py-3 text-right font-semibold">Precio unitario</th>
                  <th className="px-4 py-3 text-right font-semibold">Venta total</th>
                  <th className="px-4 py-3 font-semibold">Método de pago</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((row, index) => (
                  <tr key={`${row.date}-${row.product_or_service}-${row.payment_method}-${index}`}>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(row.date, period)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatTime(row.order_time)}</td>
                    <td className="px-4 py-3 font-medium">{row.product_or_service}</td>
                    <td className="px-4 py-3 text-right">{row.quantity}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(row.unit_price)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMoney(row.total_sale_value)}</td>
                    <td className="px-4 py-3">{row.payment_method ? paymentLabels[row.payment_method] : "Sin registro"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-[var(--muted)]">No hay ventas para este periodo.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

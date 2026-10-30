"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Employee } from "@/lib/employee-provision";
import { normalizeEmployeeSales, salesRange, validSalesRange, type EmployeeSales } from "@/lib/employee-sales";
import { formatOrderDate } from "@/lib/date-time";
import { CashHistoryPanel } from "@/components/cashbox/cash-history";
const field = "mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-base";
const button = "min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 text-sm font-semibold disabled:opacity-40";
const money = (n: number) => new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(n);
const statuses: Record<string, string> = { pendiente: "Pendiente", confirmado: "En preparación", entregado: "Entregado", pagado: "Cobrado", archivado: "Archivado" };

export function EmployeeSalesPanel({ employee }: { employee: Employee }) {
 const [result, setResult] = useState<EmployeeSales | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
 const [start, setStart] = useState(""), [end, setEnd] = useState("");
 const active = useRef<AbortController | null>(null);
 async function load(range?: { start: string; end: string }, page = 0) {
  if (range && !validSalesRange(range.start, range.end)) return setError("Elige un rango válido de hasta 366 días.");
  active.current?.abort();
  const controller = new AbortController(); active.current = controller;
  setBusy(true); setError("");
  try {
   const params = new URLSearchParams({ page: String(page), ...(range ? { start: range.start, end: range.end } : {}) });
   const response = await fetch(`/api/employees/${employee.id}/sales?${params}`, { cache: "no-store", signal: controller.signal });
   const data = await response.json();
   if (!response.ok) throw new Error(data.error || "No se pudo consultar el historial.");
   const next = normalizeEmployeeSales(data);
   if (!controller.signal.aborted) { setResult(next); setStart(next.range.start); setEnd(next.range.end); }
  } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "No se pudo consultar el historial."); }
  finally { if (!controller.signal.aborted) setBusy(false); }
 }
 // The panel is mounted afresh for each employee; abort old responses on close.
 useEffect(() => { void load(); return () => active.current?.abort(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
 function apply(event: FormEvent) { event.preventDefault(); void load({ start, end }); }
 return <div className="space-y-3" aria-busy={busy}>
  <p className="text-xs text-[var(--muted)]">Pedidos de clientes, por fecha de registro en Bolivia. El cobrado muestra el importe recibido hasta ahora.</p>
  <form onSubmit={apply} className="grid grid-cols-1 items-end gap-2 min-[380px]:grid-cols-2 sm:grid-cols-[1fr_1fr_auto]">
   <label className="min-w-0 flex-1 text-sm">Desde<input type="date" required min="2000-01-01" max="2099-12-31" value={start} onChange={e => setStart(e.target.value)} className={field}/></label>
   <label className="min-w-0 flex-1 text-sm">Hasta<input type="date" required min={start || "2000-01-01"} max="2099-12-31" value={end} onChange={e => setEnd(e.target.value)} className={field}/></label>
   <button disabled={busy} className="min-h-11 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white disabled:opacity-40 min-[380px]:col-span-2 sm:col-span-1">Filtrar</button>
  </form>
  <div className="flex gap-2">{(["day", "week", "month"] as const).map(preset => <button type="button" key={preset} disabled={busy || !result} onClick={() => result && void load(salesRange(result.range.today, preset))} className={button}>{preset === "day" ? "Hoy" : preset === "week" ? "Esta semana" : "Este mes"}</button>)}</div>
  {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}<button type="button" disabled={busy} onClick={() => void load(result?.range)} className="ml-2 min-h-11 font-semibold underline">Reintentar</button></p> : null}
  {busy ? <p role="status" className="text-sm text-[var(--muted)]">Cargando historial…</p> : null}
  {result ? <>
   <p className="text-xs text-[var(--muted)]" data-testid="employee-sales-range">{result.range.start.split("-").reverse().join("/")} al {result.range.end.split("-").reverse().join("/")}</p>
   <dl className="grid grid-cols-3 divide-x divide-[var(--border)] rounded-xl border border-[var(--border)] bg-white py-3 text-center">
    <div><dt className="text-xs text-[var(--muted)]">Pedidos</dt><dd className="mt-1 font-semibold">{result.summary.orders}</dd></div>
    <div><dt className="text-xs text-[var(--muted)]">Registrado</dt><dd className="mt-1 break-words text-sm font-semibold tabular-nums">{money(result.summary.total)}</dd></div>
    <div><dt className="text-xs text-[var(--muted)]">Cobrado</dt><dd className="mt-1 break-words text-sm font-semibold tabular-nums text-orange-800">{money(result.summary.collected)}</dd></div>
   </dl>
   {result.summary.pending ? <p className="text-xs text-[var(--muted)]">{result.summary.pending} pendientes de cobro</p> : null}
   {!result.orders.length ? <p className="py-5 text-center text-sm text-[var(--muted)]">No registró pedidos de clientes en estas fechas.</p> : <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-white px-3">{result.orders.map(order => <li key={order.id} className="py-3">
    <div className="flex flex-wrap justify-between gap-1"><div><h3 className="text-sm font-semibold">#{order.order_number} · {order.table_number}</h3><p className="mt-0.5 text-xs text-[var(--muted)]">{formatOrderDate(order.created_at)}</p></div><strong className="text-sm tabular-nums">{money(order.total)}</strong></div>
    <p className="mt-1 text-xs text-[var(--muted)]">{statuses[order.status] ?? order.status} · {order.paid_at ? order.methods.map(m => m === "cash" ? "Efectivo" : m === "qr" ? "QR" : "Tarjeta").join(" / ") || "Cobrado" : "Sin cobrar"}</p>
    {order.cashiers.length ? <p className="mt-1 text-xs">Cobró: {order.cashiers.map(c => c.name).join(", ")} · {money(order.collected)}</p> : null}
    <details className="mt-1"><summary className="inline-flex min-h-11 cursor-pointer items-center text-xs font-semibold text-orange-800">Ver productos</summary><ul className="space-y-1 text-sm">{order.items.map((item, i) => <li key={i}>{item.quantity} × {item.name}</li>)}</ul></details>
   </li>)}</ul>}
   {result.total_count > result.page_size ? <nav aria-label="Páginas del historial del empleado" className="flex items-center justify-between gap-2"><button type="button" disabled={busy || result.page === 0} onClick={() => void load(result.range, result.page - 1)} className={button}>Anterior</button><span className="text-xs">Página {result.page + 1} de {Math.ceil(result.total_count / result.page_size)}</span><button type="button" disabled={busy || (result.page + 1) * result.page_size >= result.total_count} onClick={() => void load(result.range, result.page + 1)} className={button}>Siguiente</button></nav> : null}
   <CashHistoryPanel employeeId={employee.id} externalRange={result.range} filters={false} heading="Cierres de caja de este empleado"/>
  </> : null}
 </div>;
}

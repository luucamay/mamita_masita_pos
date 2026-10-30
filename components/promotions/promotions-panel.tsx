"use client";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { discountLabel, isPricingContext, percentToBasisPoints, type DailyPromotion, type PricingContext } from "@/lib/promotions";
import { useHeaderRefresh } from "@/lib/use-header-refresh";
const field = "mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-base outline-none focus:ring-2 focus:ring-orange-200";
const button = "min-h-11 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const dateLabel = (value: string) => value.split("-").reverse().join("/");

export function PromotionsPanel({ pricing: initialPricing, promotions: initialPromotions, pricingError }: { pricing: PricingContext | null; promotions: DailyPromotion[]; pricingError: string | null }) {
  const initialSelection = initialPromotions.find((row) => row.promotion_date === initialPricing?.date);
  const [pricing, setPricing] = useState(initialPricing);
  const [rows, setRows] = useState(initialPromotions);
  const [date, setDate] = useState(initialPricing?.date ?? "");
  const [percent, setPercent] = useState(initialSelection ? String(initialSelection.discount_bps / 100) : "");
  const [active, setActive] = useState(initialSelection?.active ?? true);
  const [revision, setRevision] = useState<number | null>(initialSelection?.revision ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(pricingError ?? "");
  const [notice, setNotice] = useState("");
  useHeaderRefresh(() => { if (!busy) void refresh(); });
  function selectDate(value: string, values = rows) {
    const row = values.find((row) => row.promotion_date === value);
    setDate(value); setPercent(row ? String(row.discount_bps / 100) : ""); setActive(row?.active ?? true); setRevision(row?.revision ?? null); setNotice("");
  }
  async function refresh() {
    setBusy(true); setError("");
    try {
      const client = createClient();
      const context = await client.rpc("get_order_pricing_context");
      if (context.error || !isPricingContext(context.data)) throw new Error("No se pudo verificar el día vigente. Intenta actualizar.");
      const list = await client.from("daily_promotions").select("promotion_date,discount_bps,active,revision,updated_at").gte("promotion_date", context.data.date).order("promotion_date");
      if (list.error) throw new Error("No se pudieron cargar las promociones.");
      setPricing(context.data); setRows(list.data ?? []); selectDate(date >= context.data.date ? date : context.data.date, list.data ?? []);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo actualizar."); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || !pricing) return;
    setError(""); setNotice("");
    let bps: number;
    try { bps = percentToBasisPoints(percent); } catch (failure) { setError((failure as Error).message); return; }
    if (!date || date < pricing.date) { setError("Elige hoy o una fecha futura."); return; }
    setBusy(true);
    try {
      const { data, error } = await createClient().rpc("admin_save_daily_promotion", { p_date: date, p_discount_bps: bps, p_active: active, p_expected_revision: revision });
      if (error) throw new Error(error.code === "PGRST202" ? "Las promociones todavía no están habilitadas." : error.message);
      const row = data as DailyPromotion;
      setRows((values) => [...values.filter((value) => value.promotion_date !== row.promotion_date), row].sort((a, b) => a.promotion_date.localeCompare(b.promotion_date)));
      setRevision(row.revision); setPercent(String(row.discount_bps / 100));
      setNotice(row.active ? `Promoción del ${discountLabel(row.discount_bps)} guardada para el ${dateLabel(row.promotion_date)}.` : "Promoción desactivada. Los pedidos anteriores conservan su descuento.");
      if (row.promotion_date === pricing.date) setPricing({ ...pricing, discount_bps: row.active ? row.discount_bps : 0, revision: row.revision });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo guardar. Puedes actualizar la lista y reintentar."); }
    finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-6xl space-y-3 px-3 py-3 sm:px-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-xl font-semibold">Promociones</h1></div></header>
    {pricing ? <p className="border-y border-[var(--border)] py-3 text-sm">Hoy en Bolivia: <strong>{dateLabel(pricing.date)}</strong> · {pricing.discount_bps ? <strong className="text-orange-800">{discountLabel(pricing.discount_bps)} de descuento</strong> : "Sin promoción activa"}</p> : null}
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-800">{error}</p> : null}
    {notice ? <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p> : null}
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <form aria-label="Programar promoción" onSubmit={save} className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-3">
        <h2 className="text-xl font-semibold">Programar por fecha</h2>
        <label className="block text-sm font-medium">Fecha en Bolivia<input type="date" required min={pricing?.date} value={date} disabled={busy || !pricing} onChange={(event) => selectDate(event.target.value)} className={field} /></label>
        <div><label htmlFor="promotion-percent" className="text-sm font-medium">Descuento (%)</label><input id="promotion-percent" inputMode="decimal" required value={percent} disabled={busy || !pricing} onChange={(event) => setPercent(event.target.value)} placeholder="Ej. 15" aria-describedby="percent-help" className={field} /><p id="percent-help" className="mt-1 text-xs leading-5 text-[var(--muted)]">De 0,01 a 100 %. Una sola promoción por fecha, sin acumular descuentos.</p></div>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={active} disabled={busy || !pricing} onChange={(event) => setActive(event.target.checked)} className="h-5 w-5 accent-orange-600" />Promoción activa</label>
        <button type="submit" disabled={busy || !pricing} className="min-h-11 w-full rounded-xl bg-orange-500 px-3 py-2 font-semibold text-white disabled:opacity-40">{busy ? "Guardando…" : revision ? "Guardar cambios" : "Programar promoción"}</button>
      </form>
      <section aria-label="Promociones programadas"><h2 className="mb-3 text-xl font-semibold">Desde hoy</h2>{!rows.length ? <p className="py-8 text-sm leading-6 text-[var(--muted)]">No hay promociones programadas. Elige una fecha y un porcentaje para crear la primera.</p> : <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">{rows.map((row) => <li key={row.promotion_date} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-semibold">{dateLabel(row.promotion_date)}{row.promotion_date === pricing?.date ? " · Hoy" : ""}</p><p className="mt-1 text-sm text-[var(--muted)]">{row.active ? "Activa" : "Desactivada"}</p></div><strong className="text-lg text-orange-800">{discountLabel(row.discount_bps)}</strong><button type="button" disabled={busy} onClick={() => { selectDate(row.promotion_date); setError(""); }} className={button} aria-label={`Editar promoción del ${dateLabel(row.promotion_date)}`}>Editar</button></li>)}</ul>}</section>
    </div>
  </div>;
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizeOrderSnapshot, orderIsEditable, type OrderChange, type OrderSnapshot } from "@/lib/order-edit";
import { priceOrder } from "@/lib/money";

type Product = { id: string; name: string; price: number };
type Addition = Product & { quantity: number };
const money = (value: number) => new Intl.NumberFormat("es-BO", { style: "currency", currency: "BOB" }).format(value);
const input = "min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-base outline-none focus:ring-2 focus:ring-orange-200";

export function OrderEditor({ orderId, onSaved, onCancel, catalog }: { orderId: string; onSaved: (snapshot: OrderSnapshot) => void; onCancel: () => void; catalog?: Product[] }) {
  const [snapshot, setSnapshot] = useState<OrderSnapshot | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<Addition[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backendReady, setBackendReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const request = useRef<{ payload: string; id: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null); setBackendReady(false);
    const client = createClient();
    void (async () => {
      const [result, menu] = await Promise.all([
        client.rpc("get_order_edit_snapshot", { p_order_id: orderId }),
        catalog ? Promise.resolve({ data: catalog, error: null }) : client.from("menu_items").select("id,name,price,categories!inner(active)").eq("active", true).eq("categories.active", true).order("name"),
      ]);
      let raw = result.data;
      let snapshotError = result.error;
      const ready = !result.error;
      // Read-only preview against the older schema; never fall back to unsafe writes.
      if (result.error?.code === "PGRST202") {
        const [header, lines] = await Promise.all([client.from("orders").select("*").eq("id", orderId).single(), client.from("order_items").select("*").eq("order_id", orderId).order("created_at")]);
        raw = { order: header.data, items: lines.data ?? [] };
        snapshotError = header.error ?? lines.error;
      }
      if (!alive) return;
      if (snapshotError || menu.error || !raw?.order || !Array.isArray(raw.items)) {
        setError("No se pudieron cargar los datos actuales. Intenta recargar."); setSnapshot(null);
      } else {
        const next = normalizeOrderSnapshot(raw);
        setSnapshot(next); setProducts((menu.data ?? []).map((p) => ({ id: p.id, name: p.name, price: Number(p.price) })));
        setBackendReady(ready);
        if (!ready) setError("La edición todavía no está habilitada. Puedes revisar el pedido, pero guardar requiere habilitar el módulo.");
        setQuantities(Object.fromEntries(next.items.map((line) => [line.id, String(line.quantity)])));
        setRemoved([]); setAdded([]); request.current = null;
      }
      setLoading(false);
    })().catch(() => { if (alive) { setError("No se pudo conectar. Intenta recargar."); setLoading(false); } });
    return () => { alive = false; };
  }, [orderId, reload, catalog]);

  const editable = snapshot && orderIsEditable(snapshot.order);
  const preview = useMemo(() => {
    if (!snapshot) return null;
    try {
      return priceOrder([
        ...snapshot.items.filter((line) => line.status !== "voided" && !removed.includes(line.id)).map((line) => ({ id: line.id, unitPrice: line.unit_price, quantity: Number(quantities[line.id]) })),
        ...added.map((p) => ({ id: `add:${p.id}`, unitPrice: p.price, quantity: p.quantity })),
      ], Number(snapshot.order.discount_bps ?? 0));
    } catch { return null; }
  }, [snapshot, quantities, removed, added]);
  const changes = useMemo<OrderChange[]>(() => snapshot ? [
    ...snapshot.items.filter((line) => line.status === "pending" && (removed.includes(line.id) || Number(quantities[line.id]) !== line.quantity)).map((line): OrderChange => removed.includes(line.id) ? { action: "remove", order_item_id: line.id } : { action: "update", order_item_id: line.id, quantity: Number(quantities[line.id]) }),
    ...added.map((p): OrderChange => ({ action: "add", menu_item_id: p.id, quantity: p.quantity, expected_unit_price: p.price })),
  ] : [], [snapshot, quantities, removed, added]);
  const quantitiesValid = snapshot?.items.filter((line) => line.status !== "voided" && !removed.includes(line.id)).every((line) => /^[1-9][0-9]{0,2}$/.test(quantities[line.id] ?? ""));
  const remainingCount = (snapshot?.items.filter((line) => line.status !== "voided" && !removed.includes(line.id)).length ?? 0) + added.length;

  async function save() {
    if (!backendReady || !snapshot || !editable || !preview || !quantitiesValid || !changes.length || !remainingCount) return;
    const payload = JSON.stringify(changes);
    if (request.current?.payload !== payload) request.current = { payload, id: crypto.randomUUID() };
    setSaving(true); setError(null);
    try {
      const { data, error: failure } = await createClient().rpc("edit_order", { p_order_id: orderId, p_expected_revision: snapshot.order.revision, p_changes: changes, p_request_id: request.current!.id });
      if (failure) {
        setError(failure.code === "PGRST202" ? "La edición de pedidos todavía no está habilitada en el sistema." : failure.message);
      } else if (data?.order && Array.isArray(data.items)) onSaved(normalizeOrderSnapshot(data));
      else setError("No se pudo confirmar el pedido guardado. Puedes reintentar sin duplicar los productos.");
    } catch { setError("Se perdió la conexión. Reintenta para comprobar el resultado sin duplicar productos."); }
    finally { setSaving(false); }
  }

  function add(product: Product) {
    setAdded((current) => {
      const found = current.find((p) => p.id === product.id);
      if (found?.quantity === 999) return current;
      return found ? current.map((p) => p.id === product.id ? { ...p, quantity: p.quantity + 1 } : p) : [...current, { ...product, quantity: 1 }];
    });
  }

  return (
    <section aria-label="Editar pedido" className="mt-5 space-y-4">
      <h3 className="text-lg font-semibold">Editar pedido</h3>
      <p className="text-sm text-[var(--muted)]">Agrega productos o corrige los pendientes. Los ya entregados se conservan. Los cambios se aplican juntos al guardar.</p>
      {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {loading ? <p role="status">Cargando pedido y productos…</p> : snapshot ? <>
        {!editable ? <p role="alert" className="rounded-xl bg-orange-50 p-3 text-orange-900">Este pedido ya no admite cambios.</p> : null}
        <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          {snapshot.items.filter((line) => line.status !== "voided").map((line) => (
            <div key={line.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1"><p className={`break-words font-medium ${removed.includes(line.id) ? "line-through" : ""}`}>{line.item_name}</p><p className="text-xs text-[var(--muted)]">{line.status === "delivered" ? "Entregado · no editable" : "Pendiente"} · {money(Number(line.unit_price))} c/u</p></div>
              {line.status === "pending" && !removed.includes(line.id) ? <label className="w-20 text-xs">Cantidad<input aria-label={`Cantidad de ${line.item_name}`} inputMode="numeric" type="number" min={1} max={999} value={quantities[line.id] ?? ""} disabled={saving || !editable} onChange={(event) => setQuantities((values) => ({ ...values, [line.id]: event.target.value }))} className={input} /></label> : <span>{line.quantity} u.</span>}
              {line.status === "pending" ? <button type="button" disabled={saving || !editable} onClick={() => setRemoved((ids) => ids.includes(line.id) ? ids.filter((id) => id !== line.id) : [...ids, line.id])} className="min-h-11 px-2 text-sm font-semibold text-red-700 disabled:opacity-40">{removed.includes(line.id) ? `Restaurar ${line.item_name}` : `Quitar ${line.item_name}`}</button> : null}
            </div>
          ))}
          {added.map((p) => <div key={p.id} className="flex items-center justify-between gap-3 bg-orange-50 p-3"><p className="min-w-0 break-words">{p.quantity} × {p.name} <span className="text-xs text-orange-800">Nuevo</span></p><button type="button" disabled={saving} onClick={() => setAdded((list) => list.filter((item) => item.id !== p.id))} className="min-h-11 text-sm font-semibold text-red-700">Quitar nuevo {p.name}</button></div>)}
        </div>
        {editable ? <>
          <label className="block text-sm font-medium">Buscar producto para agregar<input value={query} onChange={(event) => setQuery(event.target.value)} className={`${input} mt-1`} placeholder="Nombre del producto" /></label>
          <div className="max-h-52 overflow-y-auto rounded-xl border border-[var(--border)]">
            {products.filter((p) => p.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim())).map((p) => <button key={p.id} type="button" aria-label={`Agregar ${p.name}`} disabled={saving} onClick={() => add(p)} className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 text-left text-sm hover:bg-orange-50 disabled:opacity-40"><span>{p.name}</span><span className="shrink-0 font-semibold">{money(p.price)}</span></button>)}
          </div>
          <div className="flex justify-between gap-3 border-t border-[var(--border)] pt-3 font-semibold"><span>Total estimado</span><span>{preview ? money(preview.netCents / 100) : "Revisa cantidades"}</span></div>
          {!remainingCount ? <p className="text-sm text-red-700">El pedido debe conservar al menos un producto.</p> : null}
          <p className="text-xs text-[var(--muted)]">El total definitivo se confirma al guardar. La hora original del pedido se conserva.</p>
        </> : null}
      </> : null}
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void save()} disabled={loading || saving || !backendReady || !editable || !changes.length || !preview || !quantitiesValid || !remainingCount} className="min-h-11 flex-1 rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white disabled:opacity-40">{saving ? "Guardando…" : "Guardar cambios"}</button>
        <button type="button" disabled={saving} onClick={onCancel} className="min-h-11 rounded-xl border border-[var(--border)] px-4 py-3 font-semibold">Cancelar cambios</button>
      </div>
      {error ? <button type="button" disabled={saving} onClick={() => setReload((value) => value + 1)} className="min-h-11 text-sm font-semibold text-orange-800 underline underline-offset-4">Descartar cambios y recargar</button> : null}
    </section>
  );
}

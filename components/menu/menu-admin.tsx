"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Category, MenuItem, QueueType } from "@/lib/types";
import { toCents } from "@/lib/money";
import { Modal } from "@/components/ui/modal";
type Window = "new" | "products" | "edit" | "categories" | null;
const field = "mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-base outline-none focus:ring-2 focus:ring-orange-200";
const primary = "min-h-11 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const secondary = "min-h-11 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40";
const searchable = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
const slugify = (value: string) => searchable(value).trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function MenuIcon({ kind }: { kind: "new" | "products" | "categories" }) {
 return <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
  {kind === "new" ? <><path d="M18 5H7a2 2 0 0 0-2 2v18a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V14M11 14h7M11 20h10M25 3v8M21 7h8"/></> : kind === "products" ? <><rect x="4" y="5" width="24" height="23" rx="3"/><path d="M4 12h24M12 12v16M17 18h6M17 23h6M8 8.5h.01M12 8.5h.01"/></> : <><path d="M4 12V7a3 3 0 0 1 3-3h5l15 15a3 3 0 0 1 0 4l-4 4a3 3 0 0 1-4 0L4 12Z"/><circle cx="10" cy="10" r="1.5"/><path d="M20 6h9M24.5 1.5v9"/></>}
 </svg>;
}
export function MenuAdmin({ initialCategories, initialItems }: { initialCategories: Category[]; initialItems: MenuItem[] }) {
 const [categories, setCategories] = useState(initialCategories), [items, setItems] = useState(initialItems);
 const [window, setWindow] = useState<Window>(null), [editing, setEditing] = useState<MenuItem | null>(null);
 const [name, setName] = useState(""), [price, setPrice] = useState(""), [category, setCategory] = useState("");
 const [categoryName, setCategoryName] = useState(""), [queueType, setQueueType] = useState<QueueType>("kitchen");
 const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
 const [query, setQuery] = useState(""), [visibility, setVisibility] = useState("all");
 const searchRef = useRef<HTMLInputElement>(null);
 useEffect(() => { setCategories(initialCategories); setItems(initialItems); }, [initialCategories, initialItems]);
 const categoryNames = useMemo(() => new Map(categories.map(c => [c.id, c.name])), [categories]);
 const filteredItems = useMemo(() => {
  const terms = searchable(query).trim().split(/\s+/).filter(Boolean);
  return items.filter(item => (visibility === "all" || item.active === (visibility === "active")) && terms.every(term => searchable(`${item.name} ${categoryNames.get(item.category_id) ?? ""}`).includes(term)));
 }, [items, categoryNames, query, visibility]);
 function open(next: Window, item?: MenuItem) {
  setError(""); setNotice(""); setWindow(next); setEditing(item ?? null);
  if (next === "new" || next === "edit") { setName(item?.name ?? ""); setPrice(item ? item.price.toFixed(2) : ""); setCategory(item?.category_id ?? categories.find(c => c.active)?.id ?? ""); }
 }
 function close() { if (!busy) { setWindow(null); setError(""); setEditing(null); } }
 async function saveProduct(event: FormEvent) {
  event.preventDefault(); if (busy) return;
  setError(""); setNotice("");
  let cents: number;
  try { cents = toCents(price.trim().replace(",", ".")); } catch { return setError("Escribe un precio válido, mayor o igual a 0 y con hasta dos decimales."); }
  if (!name.trim()) return setError("Escribe un nombre para el producto.");
  if (!categories.some(c => c.id === category && (c.active || c.id === editing?.category_id))) return setError("Selecciona una categoría activa.");
  setBusy(true);
  try {
   const values = { name: name.trim(), price: (cents / 100).toFixed(2), category_id: category };
   const client = createClient();
   let request = editing ? client.from("menu_items").update(values).eq("id", editing.id) : client.from("menu_items").insert({ ...values, sort_order: Math.max(-1, ...items.map(item => item.sort_order)) + 1 });
   if (editing?.updated_at) request = request.eq("updated_at", editing.updated_at);
   const { data, error } = await request.select().single();
   if (error || !data || editing && data.id !== editing.id) throw new Error(error?.code === "PGRST116" ? "El producto cambió o ya no está disponible. Actualiza la página y vuelve a editarlo." : error?.message ?? "No se pudo confirmar el producto guardado. Intenta nuevamente.");
   const saved = { ...data, price: Number(data.price) } as MenuItem;
   setItems(list => editing ? list.map(item => item.id === saved.id ? saved : item) : [...list, saved]);
   setNotice(editing ? "Producto actualizado." : "Producto creado."); setWindow(editing ? "products" : null); setEditing(null);
  } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo guardar el producto."); }
  finally { setBusy(false); }
 }
 async function toggleItem(item: MenuItem) {
  if (busy) return;
  if (item.active && !globalThis.confirm(`¿Retirar “${item.name}” del menú? Se conserva su historial y podrás reactivarlo.`)) return;
  setBusy(true); setError(""); setNotice("");
  try {
   let request = createClient().from("menu_items").update({ active: !item.active }).eq("id", item.id);
   if (item.updated_at) request = request.eq("updated_at", item.updated_at);
   const { data, error } = await request.select().single();
   if (error || data?.id !== item.id) throw new Error(error?.message ?? "No se pudo confirmar el cambio.");
   setItems(list => list.map(entry => entry.id === item.id ? { ...data, price: Number(data.price) } as MenuItem : entry));
   setNotice(data.active ? "Producto reactivado." : "Producto retirado. Sus ventas se conservan.");
  } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo actualizar el producto."); }
  finally { setBusy(false); }
 }
 async function addCategory(event: FormEvent) {
  event.preventDefault(); if (busy) return;
  const slug = slugify(categoryName);
  if (!slug) return setError("Escribe un nombre válido para la categoría.");
  setBusy(true); setError(""); setNotice("");
  try {
   const { data, error } = await createClient().from("categories").insert({ name: categoryName.trim(), slug, queue_type: queueType, sort_order: Math.max(-1, ...categories.map(c => c.sort_order)) + 1 }).select().single();
   if (error || !data) throw new Error(error?.code === "23505" ? "Ya existe una categoría con ese nombre." : error?.message ?? "No se pudo crear la categoría.");
   setCategories(list => [...list, data as Category]); setCategoryName(""); setNotice("Categoría creada.");
  } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo crear la categoría."); }
  finally { setBusy(false); }
 }
 async function toggleCategory(entry: Category) {
  if (busy) return;
  setBusy(true); setError(""); setNotice("");
  try {
   const { data, error } = await createClient().from("categories").update({ active: !entry.active }).eq("id", entry.id).eq("active", entry.active).select().single();
   if (error || data?.id !== entry.id) throw new Error(error?.message ?? "No se pudo confirmar la categoría.");
   setCategories(list => list.map(c => c.id === entry.id ? data as Category : c)); setNotice("Categoría actualizada.");
  } catch (failure) { setError(failure instanceof Error ? failure.message : "No se pudo actualizar la categoría."); }
  finally { setBusy(false); }
 }
 const messages = <>{error ? <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}{notice ? <p role="status" className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p> : null}</>;
 return <div className="mx-auto max-w-5xl space-y-3 px-3 py-3 sm:px-5">
  <h1 className="text-xl font-semibold">Menú admin</h1>{!window ? messages : null}
  <div className="grid gap-3 sm:grid-cols-3">{([{ kind: "new", title: "Nuevo producto", meta: "" }, { kind: "products", title: "Productos del menú", meta: `${items.filter(i => i.active).length} activos · ${items.filter(i => !i.active).length} retirados` }, { kind: "categories", title: "Nueva categoría", meta: `${categories.length} categorías` }] as const).map(option => <button type="button" key={option.kind} onClick={() => open(option.kind)} className="group flex min-h-24 items-center gap-4 rounded-2xl border border-[var(--border)] bg-white p-4 text-left transition hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 sm:min-h-40 sm:flex-col sm:items-start sm:justify-between">
   <span className="rounded-xl bg-orange-50 p-2.5 text-orange-800"><MenuIcon kind={option.kind}/></span><span className="min-w-0 flex-1 sm:flex-none"><span className="block font-semibold">{option.title}</span>{option.meta ? <span className="mt-1 block text-xs text-[var(--muted)]">{option.meta}</span> : null}</span><span aria-hidden="true" className="text-orange-700 sm:hidden">›</span>
  </button>)}</div>
  <Modal open={window !== null} title={window === "new" ? "Nuevo producto" : window === "edit" ? "Editar producto" : window === "categories" ? "Categorías" : "Productos del menú"} onClose={close} busy={busy} wide={window === "products"}>
   {messages}
   {window === "new" || window === "edit" ? <form onSubmit={saveProduct} aria-label={window === "edit" ? "Editar producto" : "Nuevo producto"} className="space-y-3">
    <label className="block text-sm font-medium">Nombre del producto<input required maxLength={200} value={name} disabled={busy} onChange={e => setName(e.target.value)} className={field}/></label>
    <div className="grid gap-3 sm:grid-cols-[1fr_130px]"><label className="block text-sm font-medium">Categoría<select aria-label="Categoría" value={category} disabled={busy} onChange={e => setCategory(e.target.value)} className={field}><option value="">Selecciona…</option>{categories.filter(c => c.active || c.id === editing?.category_id).map(c => <option key={c.id} value={c.id}>{c.name}{!c.active ? " (inactiva)" : ""}</option>)}</select></label><label className="block text-sm font-medium">Precio (Bs)<input inputMode="decimal" required value={price} disabled={busy} onChange={e => setPrice(e.target.value)} className={field} placeholder="0,00"/></label></div>
    <div className="flex justify-end gap-2 pt-1"><button type="button" disabled={busy} onClick={() => editing ? open("products") : close()} className={secondary}>Cancelar</button><button disabled={busy} className={primary}>{busy ? "Guardando…" : editing ? "Guardar cambios" : "Crear producto"}</button></div>
   </form> : null}
   {window === "products" ? <div className="space-y-2">
    <div className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-sm font-medium">Buscar productos<input ref={searchRef} type="search" value={query} onChange={e => setQuery(e.target.value)} className={field} placeholder="Nombre o categoría" autoComplete="off" aria-describedby="menu-search-count"/></label><label className="text-sm">Mostrar<select aria-label="Mostrar" value={visibility} onChange={e => setVisibility(e.target.value)} className={field}><option value="all">Todos</option><option value="active">Activos</option><option value="inactive">Retirados</option></select></label>{query ? <button type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }} className={secondary}>Limpiar búsqueda</button> : null}</div>
    <p id="menu-search-count" role="status" className="text-xs text-[var(--muted)]">{filteredItems.length} de {items.length} productos</p>
    <ul aria-label="Productos del menú" className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-white px-3">{filteredItems.map(item => <li key={item.id} data-item-id={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"><div className="min-w-0 flex-1 basis-36"><h3 className="break-words text-sm font-semibold">{item.name}{!item.active ? <span className="ml-2 text-xs font-normal text-[var(--muted)]">Retirado</span> : null}</h3><p className="text-xs text-[var(--muted)]">{categoryNames.get(item.category_id) ?? "Sin categoría"}</p></div><span className="text-sm font-semibold tabular-nums">Bs {item.price.toFixed(2)}</span><div className="ml-auto flex gap-2"><button type="button" disabled={busy} onClick={() => open("edit", item)} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-orange-800 disabled:opacity-40" aria-label={`Editar ${item.name}`}>Editar</button><button type="button" disabled={busy} onClick={() => void toggleItem(item)} className={`min-h-11 rounded-lg px-2 text-sm font-semibold disabled:opacity-40 ${item.active ? "text-red-700" : "text-emerald-800"}`} aria-label={`${item.active ? "Retirar" : "Reactivar"} ${item.name}`}>{item.active ? "Retirar" : "Reactivar"}</button></div></li>)}</ul>
    {!filteredItems.length ? <p className="py-5 text-center text-sm text-[var(--muted)]">No se encontraron productos. Prueba con otro nombre o categoría.</p> : null}
   </div> : null}
   {window === "categories" ? <div className="space-y-4"><form aria-label="Nueva categoría" onSubmit={addCategory} className="space-y-3"><label className="block text-sm font-medium">Nombre de la categoría<input required maxLength={100} value={categoryName} onChange={e => setCategoryName(e.target.value)} disabled={busy} className={field}/></label><label className="block text-sm font-medium">Preparación<select aria-label="Preparación" value={queueType} onChange={e => setQueueType(e.target.value as QueueType)} disabled={busy} className={field}><option value="kitchen">Cocina</option><option value="cafe">Café</option></select></label><div className="flex justify-end gap-2"><button type="button" onClick={close} disabled={busy} className={secondary}>Cancelar</button><button disabled={busy} className={primary}>{busy ? "Guardando…" : "Crear categoría"}</button></div></form><ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">{categories.map(c => <li key={c.id} className="flex items-center justify-between gap-3 py-1"><div className="min-w-0"><p className="break-words text-sm font-medium">{c.name}</p><p className="text-xs text-[var(--muted)]">{c.queue_type === "cafe" ? "Café" : "Cocina"}</p></div><button type="button" disabled={busy} onClick={() => void toggleCategory(c)} className="min-h-11 px-2 text-xs font-semibold text-orange-800" aria-label={`${c.active ? "Desactivar" : "Activar"} categoría ${c.name}`}>{c.active ? "Activa" : "Inactiva"}</button></li>)}</ul></div> : null}
  </Modal>
 </div>;
}

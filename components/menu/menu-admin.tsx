"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Category, MenuItem, QueueType } from "@/lib/types";

type MenuAdminProps = { initialCategories: Category[]; initialItems: MenuItem[] };

const inputClass = "mt-1.5 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 outline-none ring-orange-200 transition focus:ring-4";

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function MenuAdmin({ initialCategories, initialItems }: MenuAdminProps) {
  const [categories, setCategories] = useState(initialCategories);
  const [items, setItems] = useState(initialItems);
  const [categoryName, setCategoryName] = useState("");
  const [queueType, setQueueType] = useState<QueueType>("kitchen");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemCategory, setItemCategory] = useState(initialCategories[0]?.id ?? "");
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function begin(action: string) {
    setLoading(true); setError(null); setNotice(null);
    return action;
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoryName.trim()) return setError("Escribe un nombre para la categoría.");
    const slug = slugify(categoryName);
    if (!slug) return setError("El nombre de la categoría no es válido.");
    begin("category");
    const { data, error: insertError } = await createClient().from("categories").insert({ name: categoryName.trim(), slug, queue_type: queueType, sort_order: categories.length }).select().single();
    if (insertError) setError(insertError.code === "23505" ? "Ya existe una categoría con ese nombre." : insertError.message);
    else if (data) { setCategories((current) => [...current, data as Category]); setCategoryName(""); setNotice("Categoría creada."); }
    setLoading(false);
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = Number(itemPrice);
    if (!itemName.trim()) return setError("Escribe un nombre para el producto.");
    if (!itemCategory) return setError("Selecciona una categoría.");
    if (!Number.isFinite(price) || price < 0) return setError("El precio debe ser un número mayor o igual a 0.");
    begin("item");
    const { data, error: insertError } = await createClient().from("menu_items").insert({ name: itemName.trim(), price: price.toFixed(2), category_id: itemCategory, sort_order: items.length }).select().single();
    if (insertError) setError(insertError.message);
    else if (data) { setItems((current) => [...current, { ...data, price: Number(data.price) } as MenuItem]); setItemName(""); setItemPrice(""); setNotice("Producto creado."); }
    setLoading(false);
  }

  async function updatePrice(id: string) {
    const price = Number(priceDraft);
    if (!Number.isFinite(price) || price < 0) return setError("El precio debe ser un número mayor o igual a 0.");
    begin("price");
    const { error: updateError } = await createClient().from("menu_items").update({ price: price.toFixed(2) }).eq("id", id);
    if (updateError) setError(updateError.message);
    else { setItems((current) => current.map((item) => item.id === id ? { ...item, price } : item)); setEditingPrice(null); setNotice("Precio actualizado."); }
    setLoading(false);
  }

  async function deleteItem(item: MenuItem) {
    if (!window.confirm(`¿Eliminar “${item.name}”?`)) return;
    begin("delete");
    const { error: deleteError } = await createClient().from("menu_items").delete().eq("id", item.id);
    if (deleteError) setError(deleteError.code === "23503" ? "No puedes eliminar un producto que ya tiene pedidos." : deleteError.message);
    else { setItems((current) => current.filter((entry) => entry.id !== item.id)); setNotice("Producto eliminado."); }
    setLoading(false);
  }

  async function toggleCategory(category: Category) {
    begin("category");
    const { error: updateError } = await createClient().from("categories").update({ active: !category.active }).eq("id", category.id);
    if (updateError) setError(updateError.message);
    else { setCategories((current) => current.map((entry) => entry.id === category.id ? { ...entry, active: !entry.active } : entry)); setNotice("Categoría actualizada."); }
    setLoading(false);
  }

  return <main className="px-5 py-6 sm:px-8">
    <header className="mb-7"><p className="text-sm font-medium text-orange-600">Administración</p><h1 className="text-3xl font-semibold tracking-tight">Menú</h1><p className="mt-1 text-sm text-[var(--muted)]">Gestiona productos, precios y categorías.</p></header>
    {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
    {notice ? <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <section className="rounded-2xl border border-[var(--border)] bg-white p-5"><h2 className="text-lg font-semibold">Nuevo producto</h2><form onSubmit={addItem} className="mt-4 grid gap-3 sm:grid-cols-3 sm:items-end">
        <label className="block text-sm font-medium sm:col-span-2">Nombre<input value={itemName} onChange={(e) => setItemName(e.target.value)} className={inputClass} placeholder="Ej. Latte" /></label>
        <label className="block text-sm font-medium">Precio<input value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} className={inputClass} inputMode="decimal" placeholder="0.00" /></label>
        <label className="block text-sm font-medium sm:col-span-2">Categoría<select value={itemCategory} onChange={(e) => setItemCategory(e.target.value)} className={inputClass}><option value="">Selecciona...</option>{categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <button disabled={loading} className="rounded-xl bg-orange-500 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{loading ? "Guardando..." : "Crear producto"}</button>
      </form><div className="mt-7 overflow-x-auto"><table className="w-full min-w-[540px] text-left text-sm"><thead className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]"><tr><th className="pb-3">Producto</th><th className="pb-3">Categoría</th><th className="pb-3">Precio</th><th className="pb-3 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-[var(--border)]">{items.length === 0 ? <tr><td colSpan={4} className="py-6 text-center text-[var(--muted)]">No hay productos.</td></tr> : items.map((item) => <tr key={item.id}><td className="py-3 font-medium">{item.name}</td><td className="py-3 text-[var(--muted)]">{categories.find((category) => category.id === item.category_id)?.name ?? "Sin categoría"}</td><td className="py-3">{editingPrice === item.id ? <input autoFocus value={priceDraft} onChange={(e) => setPriceDraft(e.target.value)} className="w-24 rounded-lg border px-2 py-1" inputMode="decimal" /> : `$${item.price.toFixed(2)}`}</td><td className="py-3 text-right"><div className="flex justify-end gap-3"><button type="button" disabled={loading} onClick={() => editingPrice === item.id ? void updatePrice(item.id) : (setEditingPrice(item.id), setPriceDraft(item.price.toFixed(2)))} className="font-semibold text-orange-600">{editingPrice === item.id ? "Guardar" : "Editar precio"}</button><button type="button" disabled={loading} onClick={() => void deleteItem(item)} className="font-semibold text-red-600">Eliminar</button></div></td></tr>)}</tbody></table></div></section>
    <section className="rounded-2xl border border-[var(--border)] bg-white p-5"><h2 className="text-lg font-semibold">Nueva categoría</h2><form onSubmit={addCategory} className="mt-4 space-y-3">
        <label className="block text-sm font-medium">Nombre<input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} className={inputClass} placeholder="Ej. Bebidas" /></label>
        <label className="block text-sm font-medium">Cola<select value={queueType} onChange={(e) => setQueueType(e.target.value as QueueType)} className={inputClass}><option value="kitchen">Cocina</option><option value="cafe">Café</option></select></label>
        <button disabled={loading} className="w-full rounded-xl bg-orange-500 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{loading ? "Guardando..." : "Crear categoría"}</button>
      </form><div className="mt-6 space-y-2">{categories.length === 0 ? <p className="text-sm text-[var(--muted)]">No hay categorías.</p> : categories.map((category) => <div key={category.id} className="flex items-center justify-between rounded-xl bg-[var(--bg)] px-3 py-2.5"><div><p className="font-medium">{category.name}</p><p className="text-xs text-[var(--muted)]">{category.queue_type === "cafe" ? "Café" : "Cocina"}</p></div><button type="button" onClick={() => void toggleCategory(category)} disabled={loading} className={`text-xs font-semibold ${category.active ? "text-emerald-700" : "text-[var(--muted)]"}`}>{category.active ? "Activa" : "Inactiva"}</button></div>)}</div></section>
      
    </div>
  </main>;
}

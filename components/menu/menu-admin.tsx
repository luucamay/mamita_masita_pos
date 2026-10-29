"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Category, MenuItem, QueueType } from "@/lib/types";
import { toCents } from "@/lib/money";

type MenuAdminProps = { initialCategories: Category[]; initialItems: MenuItem[] };

const inputClass = "mt-1.5 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 outline-none ring-orange-200 transition focus:ring-4";

function slugify(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function searchable(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
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
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const categoryNames = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const filteredItems = useMemo(() => {
    const terms = searchable(query).trim().split(/\s+/).filter(Boolean);
    return items.filter((item) => {
      const text = searchable(`${item.name} ${categoryNames.get(item.category_id) ?? ""}`);
      return terms.every((term) => text.includes(term));
    });
  }, [items, categoryNames, query]);
  const editingItem = items.find((item) => item.id === editingPrice);
  const editingHidden = Boolean(editingItem && !filteredItems.some((item) => item.id === editingPrice));

  function clearSearch() {
    setQuery("");
    searchRef.current?.focus();
  }

  function cancelPriceEdit() {
    setEditingPrice(null);
    setPriceDraft("");
  }

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
    let cents: number;
    try {
      cents = toCents(priceDraft.trim().replace(",", "."));
    } catch {
      return setError("Escribe un precio válido, mayor o igual a 0 y con hasta dos decimales.");
    }
    const price = (cents / 100).toFixed(2);
    begin("price");
    const { data, error: updateError } = await createClient().from("menu_items").update({ price }).eq("id", id).select("id,price").single();
    if (updateError) setError(updateError.message);
    else if (data?.id === id) {
      setItems((current) => current.map((item) => item.id === id ? { ...item, price: Number(data.price) } : item));
      cancelPriceEdit();
      setNotice("Precio actualizado.");
    } else setError("No se pudo confirmar el precio guardado. Intenta nuevamente.");
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

  return (
    <div className="px-5 py-6 sm:px-8">
      <header className="mb-7">
        <p className="text-sm font-medium text-orange-600">Administración</p>
        <h1 className="text-3xl font-semibold tracking-tight">Menú</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Gestiona productos, precios y categorías.</p>
      </header>
      {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p> : null}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
        <section aria-label="Productos" className="min-w-0 rounded-2xl border border-[var(--border)] bg-white p-5">
          <h2 className="text-lg font-semibold">Nuevo producto</h2>
          <form onSubmit={addItem} className="mt-4 grid gap-3 sm:grid-cols-3 sm:items-end">
            <label className="block text-sm font-medium sm:col-span-2">Nombre
              <input value={itemName} onChange={(event) => setItemName(event.target.value)} className={inputClass} placeholder="Ej. Latte" />
            </label>
            <label className="block text-sm font-medium">Precio
              <input value={itemPrice} onChange={(event) => setItemPrice(event.target.value)} className={inputClass} inputMode="decimal" placeholder="0.00" />
            </label>
            <label className="block text-sm font-medium sm:col-span-2">Categoría
              <select value={itemCategory} onChange={(event) => setItemCategory(event.target.value)} className={inputClass}>
                <option value="">Selecciona...</option>
                {categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <button disabled={loading} className="min-h-11 rounded-xl bg-orange-500 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{loading ? "Guardando..." : "Crear producto"}</button>
          </form>
          <div className="mt-8 border-t border-[var(--border)] pt-6">
            <h2 className="text-lg font-semibold">Productos del menú</h2>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label htmlFor="menu-search" className="min-w-0 flex-1 text-sm font-medium">
                Buscar productos
                <input ref={searchRef} id="menu-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)}
                  className={inputClass} placeholder="Nombre o categoría" autoComplete="off" aria-describedby="menu-search-count" />
              </label>
              {query ? <button type="button" onClick={clearSearch} className="min-h-11 rounded-xl border border-orange-200 px-4 py-2.5 text-sm font-semibold text-orange-800 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700">Limpiar búsqueda</button> : null}
            </div>
            <p id="menu-search-count" role="status" className="mt-3 text-sm text-[var(--muted)]">{filteredItems.length} de {items.length} productos</p>
            {editingItem ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-orange-50 px-3 py-3 text-sm text-orange-900">
                <p className="min-w-0 flex-1">Editando el precio de <strong>{editingItem.name}</strong>. Guarda o cancela antes de editar otro producto.</p>
                {editingHidden ? <button type="button" onClick={() => setQuery(editingItem.name)} className="min-h-11 font-semibold underline underline-offset-4">Mostrar producto en edición</button> : null}
                <button type="button" onClick={cancelPriceEdit} disabled={loading} className="min-h-11 font-semibold underline underline-offset-4 disabled:opacity-50">Cancelar edición</button>
              </div>
            ) : null}
            <div className="mt-4 overflow-x-auto rounded-lg focus-visible:outline-2 focus-visible:outline-orange-700" tabIndex={0} role="region" aria-label="Tabla de productos, desplazamiento horizontal">
              <table aria-label="Productos del menú" className="w-full min-w-[580px] text-left text-sm">
                <thead className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
                  <tr><th scope="col" className="pb-3">Producto</th><th scope="col" className="pb-3">Categoría</th><th scope="col" className="pb-3">Precio</th><th scope="col" className="pb-3 text-right">Acciones</th></tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {filteredItems.length === 0 ? (
                    <tr><td colSpan={4} className="py-8 text-center text-[var(--muted)]">{items.length === 0 ? "No hay productos." : "No se encontraron productos. Prueba con otro nombre o categoría."}</td></tr>
                  ) : filteredItems.map((item) => (
                    <tr key={item.id} data-item-id={item.id}>
                      <td className="py-3 pr-3 font-medium">{item.name}{!item.active ? <span className="mt-1 block text-xs font-normal text-[var(--muted)]">Inactivo</span> : null}</td>
                      <td className="py-3 pr-3 text-[var(--muted)]">{categoryNames.get(item.category_id) ?? "Sin categoría"}</td>
                      <td className="py-3 pr-3">
                        {editingPrice === item.id
                          ? <input autoFocus aria-label={`Precio de ${item.name}`} value={priceDraft} onChange={(event) => setPriceDraft(event.target.value)} className="min-h-11 w-24 rounded-lg border border-[var(--border)] px-2 py-2 outline-none focus:ring-2 focus:ring-orange-200" inputMode="decimal" />
                          : `Bs ${item.price.toFixed(2)}`}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-4">
                          <button type="button" disabled={loading || (editingPrice !== null && editingPrice !== item.id)}
                            onClick={() => editingPrice === item.id ? void updatePrice(item.id) : (setEditingPrice(item.id), setPriceDraft(item.price.toFixed(2)), setError(null), setNotice(null))}
                            className="min-h-11 whitespace-nowrap font-semibold text-orange-800 hover:underline disabled:opacity-40">{editingPrice === item.id ? "Guardar" : "Editar precio"}</button>
                          <button type="button" disabled={loading || editingPrice !== null} onClick={() => void deleteItem(item)} className="min-h-11 font-semibold text-red-700 hover:underline disabled:opacity-40">Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <section className="min-w-0 self-start rounded-2xl border border-[var(--border)] bg-white p-5">
          <h2 className="text-lg font-semibold">Nueva categoría</h2>
          <form onSubmit={addCategory} className="mt-4 space-y-3">
            <label className="block text-sm font-medium">Nombre
              <input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} className={inputClass} placeholder="Ej. Bebidas" />
            </label>
            <label className="block text-sm font-medium">Cola
              <select value={queueType} onChange={(event) => setQueueType(event.target.value as QueueType)} className={inputClass}><option value="kitchen">Cocina</option><option value="cafe">Café</option></select>
            </label>
            <button disabled={loading} className="min-h-11 w-full rounded-xl bg-orange-500 px-4 py-2.5 font-semibold text-white disabled:opacity-50">{loading ? "Guardando..." : "Crear categoría"}</button>
          </form>
          <div className="mt-6 space-y-2">
            {categories.length === 0 ? <p className="text-sm text-[var(--muted)]">No hay categorías.</p> : categories.map((category) => (
              <div key={category.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--bg)] px-3 py-2.5">
                <div className="min-w-0"><p className="font-medium">{category.name}</p><p className="text-xs text-[var(--muted)]">{category.queue_type === "cafe" ? "Café" : "Cocina"}</p></div>
                <button type="button" onClick={() => void toggleCategory(category)} disabled={loading} className={`min-h-11 text-xs font-semibold ${category.active ? "text-emerald-700" : "text-[var(--muted)]"}`}>{category.active ? "Activa" : "Inactiva"}</button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

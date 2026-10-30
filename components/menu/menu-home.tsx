"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CloseIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/icons";
import type { Category, DraftOrderLine, MenuItem } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { priceOrder } from "@/lib/money";
import { discountLabel, type PricingContext } from "@/lib/promotions";
import { usePricingContext } from "@/lib/use-pricing-context";
import { DiscountBadge } from "@/components/orders/discount-badge";

type MenuHomeProps = {
  categories: Category[];
  items: MenuItem[];
  loadError?: string | null;
  pricing?: PricingContext | null;
  pricingError?: string | null;
};

function formatMoney(value: number) {
  return moneyFormatter.format(value);
}

const moneyFormatter = new Intl.NumberFormat("es-BO", {
  style: "currency",
  currency: "BOB",
  minimumFractionDigits: 2,
});

function formatCategoryName(name: string) {
  const normalizedName = name.trim().toLowerCase();
  return normalizedName
    ? `${normalizedName.charAt(0).toUpperCase()}${normalizedName.slice(1)}`
    : name;
}

export function MenuHome({ categories, items, loadError, pricing = null, pricingError }: MenuHomeProps) {
  const { quote, quoteError, checking, refreshQuote } = usePricingContext(pricing, pricingError);
  const router = useRouter();
  const linesRef = useRef<HTMLDivElement>(null);
  const tableRef=useRef<HTMLFieldSetElement>(null);
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<DraftOrderLine[]>([]);
  const [tableNumber, setTableNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [customTable, setCustomTable] = useState(false);
  const [paymentMethod,setPaymentMethod]=useState<"cash"|"qr"|null>(null);
  const placement=useRef<{payload:string;id:string}|null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        query.length === 0 || item.name.toLowerCase().includes(query);
      return matchesSearch;
    });
  }, [items, search]);

  const itemsByCategory = useMemo(() => {
    const itemsByCategoryId = new Map<string, MenuItem[]>();
    for (const item of filteredItems) {
      const categoryItems = itemsByCategoryId.get(item.category_id) ?? [];
      categoryItems.push(item);
      itemsByCategoryId.set(item.category_id, categoryItems);
    }

    return categories
      .map((category) => ({
        category,
        items: itemsByCategoryId.get(category.id) ?? [],
      }))
      .filter((group) => group.items.length > 0);
  }, [categories, filteredItems]);

  const quantitiesByItemId = useMemo(
    () => new Map(lines.map((line) => [line.menuItemId, line.quantity])),
    [lines],
  );

  const priced = useMemo(
    () => priceOrder(lines.map((line) => ({ id: line.menuItemId, unitPrice: line.unitPrice, quantity: line.quantity })), quote?.discount_bps ?? 0),
    [lines, quote?.discount_bps],
  );
  const unavailable = lines.some((line) => !items.some((item) => item.id === line.menuItemId && categories.some((category) => category.id === item.category_id)));
  useEffect(() => { setLines((current) => current.map((line) => { const item = items.find((item) => item.id === line.menuItemId); return item ? { ...line, unitPrice: item.price } : line; })); }, [items]);
  const productCount = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity, 0),
    [lines],
  );

  useEffect(() => {
    const container = linesRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight });
    }
  }, [lines]);

  function openPanelForItem(item: MenuItem) {
    setPanelOpen(window.matchMedia("(min-width: 768px)").matches);
    setMessage(null);

    setLines((current) => {
      const existing = current.find((line) => line.menuItemId === item.id);
      if (existing) {
        return current.map((line) =>
          line.menuItemId === item.id
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }

      return [
        ...current,
        {
          menuItemId: item.id,
          name: item.name,
          unitPrice: item.price,
          quantity: 1,
          categoryName: item.categories?.name ?? "Sin categoría",
          queueType: item.categories?.queue_type ?? "cafe",
        },
      ];
    });
  }

  function updateQuantity(menuItemId: string, delta: number) {
    setLines((current) =>
      current
        .map((line) =>
          line.menuItemId === menuItemId
            ? { ...line, quantity: line.quantity + delta }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  function removeLine(menuItemId: string) {
    setLines((current) =>
      current.filter((line) => line.menuItemId !== menuItemId),
    );
  }

  function resetOrder() {
    setLines([]);setCustomTable(false);setPaymentMethod(null);placement.current=null;
    setTableNumber("");
    setCustomerName("");
    setPanelOpen(false);
    setMessage(null);
  }

  async function handleConfirmDraft() {
    if (!quote || quoteError || checking || saving || unavailable) { setMessage("Actualiza el menú y revisa el pedido antes de confirmar."); return; }
    if (!tableNumber.trim()) {
      tableRef.current?.scrollIntoView({block:"nearest"});
        setMessage("Ingresa el número de mesa.");
      return;
    }
    if (lines.length === 0) {
      setMessage("Agrega al menos un ítem al pedido.");
      return;
    }

    if(tableNumber==="Para llevar"&&!paymentMethod){setMessage("Selecciona Efectivo o QR.");return;}
    setSaving(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        throw new Error("Tu sesión expiró. Ingresa nuevamente.");
      }

      const args={
          p_service:tableNumber==="Para llevar"?"takeaway":"table",
          p_method:tableNumber==="Para llevar"?paymentMethod:null,
          p_table_number: tableNumber.trim(),
          p_customer_name: customerName.trim() || null,
          p_expected_date: quote.date,
          p_expected_revision: quote.revision,
          p_expected_discount_bps: quote.discount_bps,
          p_items: lines.map((line) => ({
            menu_item_id: line.menuItemId,
            quantity: line.quantity,
            expected_unit_price: line.unitPrice,
          })),
      };
      const payload=JSON.stringify(args);if(placement.current?.payload!==payload)placement.current={payload,id:crypto.randomUUID()};
      const {data:createdOrder,error:createError}=await supabase.rpc("place_customer_order",{...args,p_request_id:placement.current.id});
      if (createError) {
        if (createError.code === "40001") {
          await refreshQuote(); router.refresh();
          throw new Error("El menú o la promoción cambió. Revisa el total actualizado y vuelve a confirmar.");
        }
        throw new Error(createError.message);
      }

      const order = Array.isArray(createdOrder) ? createdOrder[0] : createdOrder;
      if (!order?.order_id) throw new Error("No se pudo crear el pedido.");

      router.push("/pedidos");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo confirmar el pedido.",
      );
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-3.25rem)]">
      <section className="min-w-0 flex-1 px-3 py-3 pb-20 sm:px-4 md:pb-4">
        <h1 className="sr-only">Menú</h1>
        <label className="relative mb-3 block">
          <span className="sr-only">Buscar producto</span>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"/>
          <input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar ítem..." className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-white pl-9 pr-3 text-base outline-none focus:ring-2 focus:ring-orange-200"/>
        </label>
        {quote?.discount_bps ? <div className="mb-2"><DiscountBadge bps={quote.discount_bps}/></div>:null}
        {quoteError || !quote ? <div role="alert" className="mb-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">{quoteError || "No se pudo verificar el precio vigente."}<button type="button" onClick={()=>void refreshQuote()} disabled={checking} className="ml-2 min-h-11 font-semibold underline">Actualizar promoción</button></div>:null}
        {unavailable ? <p role="alert" className="mb-2 text-sm text-red-700">Quita del pedido el producto que dejó de estar disponible.</p>:null}
        {loadError ? <p role="alert" className="p-2 text-sm text-red-700">{loadError}</p>:null}
        {!loadError && !itemsByCategory.length ? <p className="py-6 text-center text-sm text-[var(--muted)]">{items.length ? "Sin coincidencias":"No hay productos disponibles"}</p>:null}
        <div className="space-y-1.5">
          {itemsByCategory.map(({category,items:categoryItems})=>(
            <details key={`${category.id}-${search.trim()?"search":"browse"}`} open={search.trim()?true:undefined} className="group overflow-hidden rounded-xl border border-[var(--border)] bg-white">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 [&::-webkit-details-marker]:hidden">
                {formatCategoryName(category.name)}
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true"><path d="m5 7 5 5 5-5"/></svg>
              </summary>
              <div className="grid divide-y divide-[var(--border)] border-t border-[var(--border)] lg:grid-cols-2 lg:divide-x">
                {categoryItems.map(item=>(<article key={item.id} className="flex min-h-14 items-center justify-between gap-2 px-3 py-1.5">
                  <div className="min-w-0 flex-1"><h3 className="break-words text-sm font-medium">{item.name}</h3><p className="flex flex-wrap items-baseline gap-x-2 text-xs text-[var(--muted)]">{quote?.discount_bps ? <><del>{formatMoney(item.price)}</del><strong className="text-orange-800">{formatMoney(priceOrder([{id:item.id,unitPrice:item.price,quantity:1}],quote.discount_bps).netCents/100)}</strong></>:formatMoney(item.price)}</p></div>
                  {quantitiesByItemId.get(item.id)?<div className="flex shrink-0 items-center gap-1"><button type="button" aria-label={`Disminuir ${item.name}`} onClick={()=>updateQuantity(item.id,-1)} className="flex h-11 w-11 items-center justify-center rounded-lg bg-stone-100"><MinusIcon className="h-4 w-4"/></button><span className="min-w-5 text-center text-sm font-semibold">{quantitiesByItemId.get(item.id)}</span><button type="button" aria-label={`Agregar otro ${item.name}`} onClick={()=>openPanelForItem(item)} className="flex h-11 w-11 items-center justify-center rounded-lg bg-orange-100 text-orange-800"><PlusIcon className="h-4 w-4"/></button></div>:<button type="button" aria-label={`Agregar ${item.name}`} onClick={()=>openPanelForItem(item)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-orange-500 text-white hover:bg-orange-600"><PlusIcon className="h-5 w-5"/></button>}
                </article>))}
              </div>
            </details>
          ))}
        </div>
      </section>
      <aside className={panelOpen?"fixed inset-0 z-50 w-full border-[var(--border)] bg-white md:sticky md:inset-auto md:top-13 md:max-w-sm md:self-start md:border-l":"hidden"}>
        {panelOpen?<div className="flex h-dvh flex-col md:h-[calc(100dvh-3.25rem)]">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] px-3"><h2 className="text-base font-semibold">Pedido</h2><button type="button" onClick={()=>setPanelOpen(false)} aria-label="Volver al menú" className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-stone-100"><CloseIcon className="h-5 w-5"/></button></div>
          <div ref={linesRef} className="flex-1 overflow-y-auto px-3 py-2">
            <fieldset ref={tableRef} className="mb-2"><legend className="mb-1 text-xs font-medium text-[var(--muted)]">Mesa</legend><div data-testid="table-shortcuts" className="grid grid-cols-[repeat(6,minmax(0,1fr))_minmax(0,2.5fr)_minmax(0,1.5fr)] gap-1">{["1","2","3","4","5","6","Para llevar"].map(table=><button key={table} type="button" aria-pressed={!customTable&&tableNumber===table} onClick={()=>{setCustomTable(false);setTableNumber(table);}} className={`min-h-11 min-w-0 whitespace-nowrap rounded-lg border px-0.5 font-semibold ${table==="Para llevar"?"text-[11px]":"text-sm"} ${!customTable&&tableNumber===table?"border-orange-500 bg-orange-500 text-white":"border-[var(--border)] bg-white"}`}>{table}</button>)}<button type="button" aria-pressed={customTable} onClick={()=>{setCustomTable(true);setTableNumber("");}} className={`min-h-11 min-w-0 whitespace-nowrap rounded-lg border px-0.5 text-xs ${customTable?"border-orange-500 bg-orange-50":"border-[var(--border)]"}`}>Otra</button></div>{customTable?<input aria-label="Nro. de mesa" autoFocus value={tableNumber} onChange={event=>setTableNumber(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] px-3 text-base outline-none focus:ring-2 focus:ring-orange-200" placeholder="Mesa"/>:null}</fieldset>
            <label className="mb-2 block"><span className="sr-only">Nombre del cliente (opcional)</span><input value={customerName} onChange={event=>setCustomerName(event.target.value)} placeholder="Cliente (opcional)" className="min-h-11 w-full rounded-lg border border-[var(--border)] px-3 text-base outline-none focus:ring-2 focus:ring-orange-200"/></label>
            <div className="divide-y divide-[var(--border)]">{!lines.length?<p className="py-6 text-center text-sm text-[var(--muted)]">Pedido vacío</p>:lines.map(line=><div key={line.menuItemId} className="py-1"><div className="flex items-center justify-between gap-2"><p className="min-w-0 break-words text-sm font-medium">{line.name}</p><button type="button" aria-label={`Quitar ${line.name}`} onClick={()=>removeLine(line.menuItemId)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-red-50"><TrashIcon className="h-4 w-4"/></button></div><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1"><button type="button" aria-label={`Disminuir ${line.name} del pedido`} onClick={()=>updateQuantity(line.menuItemId,-1)} className="flex h-11 w-11 items-center justify-center rounded-lg bg-stone-100"><MinusIcon className="h-4 w-4"/></button><span className="min-w-6 text-center text-sm font-semibold">{line.quantity}</span><button type="button" aria-label={`Aumentar ${line.name} del pedido`} onClick={()=>updateQuantity(line.menuItemId,1)} className="flex h-11 w-11 items-center justify-center rounded-lg bg-orange-100 text-orange-800"><PlusIcon className="h-4 w-4"/></button></div><p className="text-sm font-semibold tabular-nums">{formatMoney((priced.lines.find(item=>item.id===line.menuItemId)?.netCents??0)/100)}</p></div></div>)}</div>
          </div>
          <div className="shrink-0 space-y-2 border-t border-[var(--border)] px-3 py-2">
            {message?<p role="alert" className="rounded-lg bg-orange-50 p-2 text-sm text-orange-900">{message}</p>:null}
            {quote?.discount_bps?<><div className="flex justify-between text-xs text-[var(--muted)]"><span>Subtotal</span><span>{formatMoney(priced.grossCents/100)}</span></div><div className="flex justify-between text-xs text-orange-800"><span>Descuento ({discountLabel(quote.discount_bps)})</span><span>−{formatMoney(priced.discountCents/100)}</span></div></>:null}
            <div className="flex justify-between font-semibold"><span>Total</span><span>{formatMoney(priced.netCents/100)}</span></div>
            {tableNumber==="Para llevar"?<div role="group" aria-label="Medio de pago" className="grid grid-cols-2 gap-2">{(["cash","qr"] as const).map(method=><button key={method} type="button" aria-pressed={paymentMethod===method} onClick={()=>setPaymentMethod(method)} className={`min-h-11 rounded-lg border text-sm font-semibold ${paymentMethod===method?"border-orange-500 bg-orange-50 text-orange-900":"border-[var(--border)]"}`}>{method==="cash"?"Efectivo":"QR"}</button>)}</div>:null}
            <div className="grid grid-cols-[auto_1fr] gap-2"><button type="button" onClick={resetOrder} disabled={saving} className="min-h-11 rounded-lg border border-[var(--border)] px-3 text-sm">Cancelar</button><button type="button" disabled={saving||checking||!quote||!!quoteError||unavailable||!lines.length} onClick={handleConfirmDraft} className="min-h-11 rounded-lg bg-orange-500 px-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">{saving?"Guardando...":tableNumber==="Para llevar"?"Cobrar y registrar":"Registrar pedido"}</button></div>
          </div>
        </div>:null}
      </aside>
      {!panelOpen&&lines.length>0?<div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-[var(--border)] bg-white px-3 py-2 md:hidden"><span className="text-sm font-semibold">{productCount} · {formatMoney(priced.netCents/100)}</span><button type="button" onClick={()=>setPanelOpen(true)} className="min-h-11 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white">Ver pedido</button></div>:null}
    </div>
  );
}

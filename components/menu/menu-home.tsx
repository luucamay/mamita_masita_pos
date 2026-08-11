"use client";

import { useMemo, useState } from "react";
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

type MenuHomeProps = {
  categories: Category[];
  items: MenuItem[];
  loadError?: string | null;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
    minimumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

function printKitchenTicket({
  orderNumber,
  tableNumber,
  customerName,
  lines,
  target,
}: {
  orderNumber: string;
  tableNumber: string;
  customerName: string;
  lines: DraftOrderLine[];
  target?: Window | null;
}) {
  const printWindow = target ?? window.open("", "_blank", "width=420,height=650");
  if (!printWindow) throw new Error("Permite las ventanas emergentes para imprimir la comanda.");

  const items = lines
    .filter((line) => line.queueType === "kitchen")
    .map(
      (line) =>
        `<li><strong>${line.quantity} x</strong> ${escapeHtml(line.name)}</li>`,
    )
    .join("");

  printWindow.document.write(`<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Cocina #${escapeHtml(orderNumber)}</title>
        <style>
          @page { size: 80mm auto; margin: 4mm; }
          * { box-sizing: border-box; }
          body { width: 72mm; margin: 0; color: #111; font: 14px/1.35 Arial, sans-serif; }
          h1 { margin: 0 0 8px; font-size: 22px; }
          p { margin: 3px 0; }
          ul { margin: 14px 0 0; padding: 0; list-style: none; }
          li { border-top: 1px dashed #777; padding: 9px 0; font-size: 17px; }
          .meta { font-size: 13px; }
          .time { margin-top: 12px; font-size: 12px; color: #555; }
        </style>
      </head>
      <body>
        <h1>COCINA #${escapeHtml(orderNumber)}</h1>
        <p><strong>Mesa:</strong> ${escapeHtml(tableNumber)}</p>
        ${customerName ? `<p><strong>Cliente:</strong> ${escapeHtml(customerName)}</p>` : ""}
        <ul>${items}</ul>
        <p class="time">${new Intl.DateTimeFormat("es-BO", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date())}</p>
      </body>
    </html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.close();
}

export function MenuHome({ categories, items, loadError }: MenuHomeProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [lines, setLines] = useState<DraftOrderLine[]>([]);
  const [tableNumber, setTableNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [needsDetails, setNeedsDetails] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesCategory =
        activeCategoryId === "all" || item.category_id === activeCategoryId;
      const matchesSearch =
        query.length === 0 || item.name.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategoryId, items, search]);

  const itemsByCategory = useMemo(() => {
    return categories
      .map((category) => ({
        category,
        items: filteredItems.filter((item) => item.category_id === category.id),
      }))
      .filter((group) => group.items.length > 0);
  }, [categories, filteredItems]);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [lines],
  );

  function openPanelForItem(item: MenuItem) {
    setPanelOpen(true);
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
    setLines([]);
    setTableNumber("");
    setCustomerName("");
    setNeedsDetails(true);
    setPanelOpen(false);
    setMessage(null);
  }

  function handleCreateOrderMeta() {
    if (!tableNumber.trim()) {
      setMessage("Ingresa el número de mesa.");
      return;
    }
    setNeedsDetails(false);
    setMessage(null);
  }

  async function handleConfirmDraft() {
    if (!tableNumber.trim()) {
      setNeedsDetails(true);
      setMessage("Ingresa el número de mesa.");
      return;
    }
    if (lines.length === 0) {
      setMessage("Agrega al menos un ítem al pedido.");
      return;
    }

    const kitchenLines = lines.filter((line) => line.queueType === "kitchen");
    const printWindow = kitchenLines.length > 0
      ? window.open("", "_blank", "width=420,height=650")
      : null;
    if (kitchenLines.length > 0 && !printWindow) {
      setMessage("Permite las ventanas emergentes para imprimir la comanda.");
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        throw new Error("Tu sesión expiró. Ingresa nuevamente.");
      }

      const { data: createdOrder, error: createError } = await supabase.rpc(
        "create_order",
        {
          p_table_number: tableNumber.trim(),
          p_customer_name: customerName.trim() || null,
          p_created_by: userData.user.id,
        },
      );
      if (createError) throw createError;

      const order = Array.isArray(createdOrder) ? createdOrder[0] : createdOrder;
      if (!order?.order_id) throw new Error("No se pudo crear el pedido.");

      for (const line of lines) {
        const { error: itemError } = await supabase.rpc("add_order_item", {
          p_order_id: order.order_id,
          p_menu_item_id: line.menuItemId,
          p_quantity: line.quantity,
          p_created_by: userData.user.id,
        });
        if (itemError) throw itemError;
      }

      const { error: confirmError } = await supabase.rpc("confirm_order", {
        p_order_id: order.order_id,
        p_confirmed_by: userData.user.id,
      });
      if (confirmError) throw confirmError;

      if (printWindow) {
        printKitchenTicket({
          orderNumber: order.order_number,
          tableNumber: tableNumber.trim(),
          customerName: customerName.trim(),
          lines: kitchenLines,
          target: printWindow,
        });
      }

      router.push("/pedidos");
      router.refresh();
    } catch (error) {
      printWindow?.close();
      setMessage(
        error instanceof Error ? error.message : "No se pudo confirmar el pedido.",
      );
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <section className="min-w-0 flex-1 px-6 py-5 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--muted)]">
              Mamita Masita POS
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Menú</h1>
          </div>
          <label className="relative w-full max-w-md">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar ítem..."
              className="w-full rounded-2xl border border-[var(--border)] bg-white py-3 pr-4 pl-10 text-sm outline-none ring-orange-200 transition focus:ring-4"
            />
          </label>
        </header>

        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveCategoryId("all")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeCategoryId === "all"
                ? "bg-orange-500 text-white"
                : "bg-white text-[var(--ink)] ring-1 ring-[var(--border)] hover:bg-orange-50"
            }`}
          >
            Todos
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategoryId(category.id)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeCategoryId === category.id
                  ? "bg-orange-500 text-white"
                  : "bg-white text-[var(--ink)] ring-1 ring-[var(--border)] hover:bg-orange-50"
              }`}
            >
              {category.name}
            </button>
          ))}
        </div>

        {loadError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        ) : null}

        {!loadError && items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white px-6 py-16 text-center">
            <p className="text-lg font-medium">No hay ítems en el menú</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Agrega productos desde Admin menú o corre el seed de Supabase.
            </p>
          </div>
        ) : null}

        <div className="space-y-8">
          {itemsByCategory.map(({ category, items: categoryItems }) => (
            <section key={category.id}>
              <div className="mb-3 flex items-end justify-between">
                <h2 className="text-lg font-semibold">{category.name}</h2>
                <span className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
                  {category.queue_type === "kitchen" ? "Cocina" : "Café"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {categoryItems.map((item) => (
                  <article
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate font-medium">{item.name}</h3>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {formatMoney(item.price)}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Agregar ${item.name}`}
                      onClick={() => openPanelForItem(item)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm transition hover:bg-orange-600"
                    >
                      <PlusIcon className="h-5 w-5" />
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <aside
        className={`border-l border-[var(--border)] bg-white transition-all ${
          panelOpen ? "w-full max-w-md" : "w-0 overflow-hidden border-l-0"
        }`}
      >
        {panelOpen ? (
          <div className="flex h-full min-h-screen flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div>
                <p className="text-xs font-medium tracking-wide text-[var(--muted)] uppercase">
                  Pedido actual
                </p>
                <h2 className="text-xl font-semibold">
                  {needsDetails ? "Nuevo pedido" : `Mesa ${tableNumber}`}
                </h2>
                {!needsDetails && customerName.trim() ? (
                  <p className="text-sm text-[var(--muted)]">
                    {customerName.trim()}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="rounded-full p-2 text-[var(--muted)] hover:bg-gray-100"
                aria-label="Cerrar panel"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {needsDetails ? (
                <div className="space-y-3 rounded-2xl bg-[var(--bg)] p-4">
                  <label className="block text-sm font-medium">
                    Nro. de mesa *
                    <input
                      value={tableNumber}
                      onChange={(event) => setTableNumber(event.target.value)}
                      placeholder="Ej. 4"
                      className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 outline-none ring-orange-200 focus:ring-4"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Nombre del cliente (opcional)
                    <input
                      value={customerName}
                      onChange={(event) => setCustomerName(event.target.value)}
                      placeholder="Ej. Ana"
                      className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 outline-none ring-orange-200 focus:ring-4"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleCreateOrderMeta}
                    className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600"
                  >
                    Crear
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setNeedsDetails(true)}
                  className="text-sm font-medium text-orange-600 hover:underline"
                >
                  Editar mesa / cliente
                </button>
              )}

              <div className="space-y-3">
                {lines.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-10 text-center text-sm text-[var(--muted)]">
                    Usa el botón + del menú para agregar ítems.
                  </div>
                ) : (
                  lines.map((line) => (
                    <div
                      key={line.menuItemId}
                      className="rounded-2xl border border-[var(--border)] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{line.name}</p>
                          <p className="text-xs text-[var(--muted)]">
                            {line.categoryName} · {formatMoney(line.unitPrice)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(line.menuItemId)}
                          className="rounded-lg p-1.5 text-[var(--muted)] hover:bg-red-50 hover:text-red-600"
                          aria-label={`Quitar ${line.name}`}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateQuantity(line.menuItemId, -1)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
                            aria-label="Disminuir"
                          >
                            <MinusIcon className="h-4 w-4" />
                          </button>
                          <span className="min-w-6 text-center font-semibold">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(line.menuItemId, 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-orange-700 hover:bg-orange-200"
                            aria-label="Aumentar"
                          >
                            <PlusIcon className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="font-semibold">
                          {formatMoney(line.unitPrice * line.quantity)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-3 border-t border-[var(--border)] px-5 py-4">
              {message ? (
                <p className="rounded-xl bg-orange-50 px-3 py-2 text-sm text-orange-800">
                  {message}
                </p>
              ) : null}
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--muted)]">Subtotal</span>
                <span className="text-lg font-semibold">
                  {formatMoney(subtotal)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={resetOrder}
                  className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-semibold hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleConfirmDraft}
                  className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Guardando..." : "Confirmar"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

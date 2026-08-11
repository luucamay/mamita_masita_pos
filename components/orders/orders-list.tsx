"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { OpenOrder } from "@/lib/types";

type PaymentMethod = "cash" | "qr" | "card";

type OrderDetailItem = {
  id: string;
  item_name: string;
  category_name: string;
  quantity: number;
  unit_price: number | string;
  line_total: number | string;
  status: string;
};

function formatMoney(value: number | string) {
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
  }).format(Number(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function OrdersList({ orders }: { orders: OpenOrder[] }) {
  const router = useRouter();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [paymentOrderId, setPaymentOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OpenOrder | null>(null);
  const [detailItems, setDetailItems] = useState<OrderDetailItem[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOrder) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedOrder(null);
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [selectedOrder]);

  async function showDetails(order: OpenOrder) {
    setSelectedOrder(order);
    setDetailItems([]);
    setDetailsError(null);
    setDetailsLoading(true);

    const { data, error: detailError } = await createClient()
      .from("order_items")
      .select("id, item_name, category_name, quantity, unit_price, line_total, status")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });

    if (detailError) setDetailsError(detailError.message);
    else {
      setDetailItems(
        (data ?? []).map((item) => ({
          ...item,
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
          line_total: Number(item.line_total),
        })) as OrderDetailItem[],
      );
    }
    setDetailsLoading(false);
  }

  async function markDelivered(orderId: string) {
    setWorkingId(orderId);
    setError(null);
    const { error: rpcError } = await createClient().rpc("mark_order_delivered", {
      p_order_id: orderId,
    });

    if (rpcError) setError(rpcError.message);
    else {
      setSelectedOrder((current) =>
        current?.id === orderId ? { ...current, status: "entregado" } : current,
      );
      router.refresh();
    }
    setWorkingId(null);
  }

  async function registerPayment(orderId: string, method: PaymentMethod) {
    setWorkingId(orderId);
    setError(null);
    const supabase = createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      setError("Tu sesión expiró. Ingresa nuevamente.");
      setWorkingId(null);
      return;
    }

    const { error: paymentError } = await supabase.rpc("register_payment", {
      p_order_id: orderId,
      p_payment_method: method,
      p_received_by: userData.user.id,
    });
    if (paymentError) {
      setError(paymentError.message);
      setWorkingId(null);
      return;
    }

    const { error: archiveError } = await supabase.rpc("archive_order", {
      p_order_id: orderId,
      p_archived_by: userData.user.id,
    });
    if (archiveError) setError(archiveError.message);
    else {
      setPaymentOrderId(null);
      setSelectedOrder((current) =>
        current?.id === orderId ? { ...current, status: "pagado" } : current,
      );
      router.refresh();
    }
    setWorkingId(null);
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white px-6 py-16 text-center">
        <p className="font-medium">No hay pedidos abiertos</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Los pedidos confirmados aparecerán aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
      {orders.map((order) => {
        const delivered = order.status === "entregado";
        return (
           <article
             key={order.id}
             role="button"
             tabIndex={0}
             onClick={() => showDetails(order)}
             onKeyDown={(event) => {
               if (event.key === "Enter" || event.key === " ") {
                 event.preventDefault();
                 showDetails(order);
               }
             }}
             className={`cursor-pointer rounded-2xl border px-4 py-4 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
              delivered
                ? "border-gray-200 bg-gray-100/80"
                : "border-orange-200 bg-orange-50/70"
            }`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-semibold">#{order.order_number}</h2>
                  <span className="text-sm text-[var(--muted)]">Mesa {order.table_number}</span>
                  <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium capitalize">
                    {order.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {formatDate(order.created_at)} · {order.item_count} ítem(s)
                  {order.customer_name ? ` · ${order.customer_name}` : ""}
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <p className="font-semibold">{formatMoney(order.total)}</p>
                {!delivered ? (
                   <button
                     type="button"
                     disabled={workingId === order.id}
                     onClick={(event) => {
                       event.stopPropagation();
                       markDelivered(order.id);
                     }}
                    className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                  >
                    {workingId === order.id ? "Guardando..." : "Entregado"}
                  </button>
                ) : paymentOrderId === order.id ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    {(["cash", "qr", "card"] as PaymentMethod[]).map((method) => (
                      <button
                        key={method}
                       type="button"
                       disabled={workingId === order.id}
                       onClick={(event) => {
                         event.stopPropagation();
                         registerPayment(order.id, method);
                       }}
                        className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60"
                      >
                        {method === "cash" ? "Efectivo" : method === "qr" ? "QR" : "Tarjeta"}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                   type="button"
                   onClick={(event) => {
                     event.stopPropagation();
                     setPaymentOrderId(order.id);
                   }}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-gray-50"
                  >
                    Pagar
                  </button>
                )}
              </div>
            </div>
           </article>
         );
       })}
      {selectedOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
          role="presentation"
          onClick={() => setSelectedOrder(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-details-title"
            className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-orange-600">Detalle del pedido</p>
                <h2 id="order-details-title" className="mt-1 text-xl font-semibold">
                  #{selectedOrder.order_number}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Cerrar detalle"
                onClick={() => setSelectedOrder(null)}
                className="rounded-xl px-3 py-1 text-2xl leading-none text-[var(--muted)] hover:bg-gray-100"
              >
                ×
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-orange-50 p-4 text-sm">
              <div>
                <p className="text-[var(--muted)]">Mesa</p>
                <p className="mt-1 font-semibold">{selectedOrder.table_number}</p>
              </div>
              <div>
                <p className="text-[var(--muted)]">Estado</p>
                <p className="mt-1 font-semibold capitalize">{selectedOrder.status}</p>
              </div>
              {selectedOrder.customer_name ? (
                <div className="col-span-2">
                  <p className="text-[var(--muted)]">Cliente</p>
                  <p className="mt-1 font-semibold">{selectedOrder.customer_name}</p>
                </div>
              ) : null}
            </div>

            {detailsLoading ? (
              <p className="py-10 text-center text-sm text-[var(--muted)]">Cargando productos...</p>
            ) : detailsError ? (
              <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                No se pudo cargar el detalle: {detailsError}
              </p>
            ) : (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  <span>Productos</span>
                  <span>{selectedOrder.item_count} ítem(s)</span>
                </div>
                <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)]">
                  {detailItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{item.quantity} × {item.item_name}</p>
                        <p className="text-xs text-[var(--muted)]">{item.category_name} · {formatMoney(item.unit_price)} c/u</p>
                      </div>
                      <p className="shrink-0 font-semibold">{formatMoney(item.line_total)}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
                  <span className="font-semibold">Total</span>
                  <span className="text-lg font-semibold">{formatMoney(selectedOrder.total)}</span>
                </div>
                <div className="mt-5">
                  {selectedOrder.status !== "entregado" && selectedOrder.status !== "pagado" ? (
                    <button
                      type="button"
                      disabled={workingId === selectedOrder.id}
                      onClick={() => markDelivered(selectedOrder.id)}
                      className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                    >
                      {workingId === selectedOrder.id ? "Guardando..." : "Entregado"}
                    </button>
                  ) : selectedOrder.status === "pagado" ? (
                    <div className="w-full rounded-xl bg-green-50 px-4 py-3 text-center text-sm font-semibold text-green-700">
                      Pagado
                    </div>
                  ) : paymentOrderId === selectedOrder.id ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      {(["cash", "qr", "card"] as PaymentMethod[]).map((method) => (
                        <button
                          key={method}
                          type="button"
                          disabled={workingId === selectedOrder.id}
                          onClick={() => registerPayment(selectedOrder.id, method)}
                          className="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-3 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60"
                        >
                          {method === "cash" ? "Efectivo" : method === "qr" ? "QR" : "Tarjeta"}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPaymentOrderId(selectedOrder.id)}
                      className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold hover:bg-gray-50"
                    >
                      Pagar
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

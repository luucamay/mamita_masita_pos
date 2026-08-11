"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { OpenOrder } from "@/lib/types";

type PaymentMethod = "cash" | "qr" | "card";

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
  const [error, setError] = useState<string | null>(null);

  async function markDelivered(orderId: string) {
    setWorkingId(orderId);
    setError(null);
    const { error: rpcError } = await createClient().rpc("mark_order_delivered", {
      p_order_id: orderId,
    });

    if (rpcError) setError(rpcError.message);
    else router.refresh();
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
            className={`rounded-2xl border px-4 py-4 shadow-sm ${
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
                    onClick={() => markDelivered(order.id)}
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
                        onClick={() => registerPayment(order.id, method)}
                        className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60"
                      >
                        {method === "cash" ? "Efectivo" : method === "qr" ? "QR" : "Tarjeta"}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPaymentOrderId(order.id)}
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
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { CafeQueueItem } from "@/lib/types";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function playNotification() {
  const AudioContextClass = window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(740, context.currentTime);
  oscillator.frequency.linearRampToValueAtTime(980, context.currentTime + 0.12);
  gain.gain.setValueAtTime(0.001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.45);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.45);
  oscillator.addEventListener("ended", () => void context.close());
}

export function CafeQueue({ initialItems }: { initialItems: CafeQueueItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("cafe-queue")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_items" },
        (payload) => {
          if (payload.new.queue_type !== "cafe" || payload.new.status !== "pending") return;
          if (soundEnabledRef.current) playNotification();
          router.refresh();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "order_items" },
        (payload) => {
          if (payload.new.queue_type === "cafe") router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  async function markDelivered(itemId: string) {
    setWorkingId(itemId);
    setError(null);
    const { error: rpcError } = await createClient().rpc("mark_order_item_delivered", {
      p_order_item_id: itemId,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setItems((current) => current.filter((item) => item.order_item_id !== itemId));
      router.refresh();
    }
    setWorkingId(null);
  }

  const grouped = items.reduce<Map<string, CafeQueueItem[]>>((groups, item) => {
    const orderItems = groups.get(item.order_id) ?? [];
    orderItems.push(item);
    groups.set(item.order_id, orderItems);
    return groups;
  }, new Map());

  return (
    <div>
      

      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {grouped.size === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white px-6 py-16 text-center">
          <p className="font-medium">No hay pedidos de café pendientes</p>
          <p className="mt-1 text-sm text-[var(--muted)]">Esta pantalla se actualizará cuando llegue un pedido.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...grouped].map(([orderId, orderItems]) => {
            const order = orderItems[0];
            return (
              <article key={orderId} className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
                <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-4">
                  <div>
                    <h2 className="text-lg font-semibold">Pedido #{order.order_number}</h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Mesa {order.table_number}{order.customer_name ? ` · ${order.customer_name}` : ""}
                    </p>
                  </div>
                  <time className="text-sm font-medium text-[var(--muted)]">{formatTime(order.created_at)}</time>
                </header>
                <ul className="divide-y divide-[var(--border)]">
                  {orderItems.map((item) => (
                    <li key={item.order_item_id} className="flex items-center justify-between gap-3 py-4">
                      <div>
                        <p className="font-medium">{item.item_name}</p>
                        <p className="mt-1 text-sm text-[var(--muted)]">Cantidad: {item.quantity}</p>
                      </div>
                      <button
                        type="button"
                        disabled={workingId === item.order_item_id}
                        onClick={() => markDelivered(item.order_item_id)}
                        className="shrink-0 rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
                      >
                        {workingId === item.order_item_id ? "..." : "Entregado"}
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

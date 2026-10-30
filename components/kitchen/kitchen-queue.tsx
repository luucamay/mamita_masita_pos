"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLiveQueue } from "@/lib/use-live-queue";
import { QueueStatus } from "@/components/queue-status";
import type { KitchenQueueItem } from "@/lib/types";
import { formatOrderTime as formatTime } from "@/lib/date-time";

function playNotification() {
  const AudioContextClass = window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(520, context.currentTime);
  oscillator.frequency.linearRampToValueAtTime(720, context.currentTime + 0.12);
  gain.gain.setValueAtTime(0.001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.45);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.45);
  oscillator.addEventListener("ended", () => void context.close());
}

export function KitchenQueue({ initialItems }: { initialItems: KitchenQueueItem[] }) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const { items, setItems, status, refresh } = useLiveQueue<KitchenQueueItem>({
    queue: "kitchen", initialItems, onInsert: () => { if (soundEnabledRef.current) playNotification(); },
  });

  async function markReady(itemId: string) {
    setWorkingId(itemId);
    setError(null);
    const { error: rpcError } = await createClient().rpc("mark_kitchen_item_delivered", {
      p_order_item_id: itemId,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setItems((current) => current.filter((item) => item.order_item_id !== itemId));
      refresh();
    }
    setWorkingId(null);
  }

  const grouped = items.reduce<Map<string, KitchenQueueItem[]>>((groups, item) => {
    const orderItems = groups.get(item.order_id) ?? [];
    orderItems.push(item);
    groups.set(item.order_id, orderItems);
    return groups;
  }, new Map());

  return (
    <div>
      <QueueStatus status={status} onRefresh={refresh}/>

      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {grouped.size === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white px-4 py-6 text-center">
          <p className="font-medium">No hay pedidos de cocina pendientes</p>

        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {[...grouped].map(([orderId, orderItems]) => {
            const order = orderItems[0];
            return (
              <article key={orderId} className="rounded-2xl border border-[var(--border)] bg-white p-3">
                <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] pb-2">
                  <div>
                    <h2 className="text-base font-semibold">Pedido #{order.order_number}</h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">Mesa {order.table_number}{order.customer_name ? ` · ${order.customer_name}` : ""}</p>
                  </div>
                  <time className="text-sm font-medium text-[var(--muted)]">{formatTime(order.created_at)}</time>
                </header>
                <ul className="divide-y divide-[var(--border)]">
                  {orderItems.map((item) => (
                    <li key={item.order_item_id} className="flex items-center justify-between gap-2 py-2">
                      <div><p className="font-medium">{item.quantity} × {item.item_name}</p></div>
                      <button type="button" disabled={workingId === item.order_item_id} onClick={() => markReady(item.order_item_id)} className="min-h-11 shrink-0 rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-60">
                        {workingId === item.order_item_id ? "..." : "Listo"}
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

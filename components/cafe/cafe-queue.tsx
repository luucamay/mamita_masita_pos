"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLiveQueue } from "@/lib/use-live-queue";
import { QueueStatus } from "@/components/queue-status";
import type { CafeQueueItem } from "@/lib/types";
import { formatOrderTime as formatTime } from "@/lib/date-time";

function playNotification(context: AudioContext) {
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
}

export function CafeQueue({ initialItems, role }: { initialItems: CafeQueueItem[]; role: string }) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundReady, setSoundReady] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  const audioContextRef = useRef<AudioContext | null>(null);
  const notifiedOrderIdsRef = useRef(new Set<string>());

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    if ("Notification" in window) setNotificationPermission(Notification.permission);
  }, []);

  const { items, setItems, status, refresh } = useLiveQueue<CafeQueueItem>({
    queue: "cafe", initialItems, onInsert: row => {
      if (soundEnabledRef.current && audioContextRef.current?.state === "running") playNotification(audioContextRef.current);
      if (role === "barista" && notificationPermission === "granted" && !notifiedOrderIdsRef.current.has(row.order_id)) {
        notifiedOrderIdsRef.current.add(row.order_id);
        new Notification("Nuevo pedido de café", { body: "Hay un pedido nuevo pendiente en la cola.", tag: `cafe-order-${row.order_id}` });
      }
    },
  });

  async function markDelivered(itemId: string) {
    setWorkingId(itemId);
    setError(null);
    const { error: rpcError } = await createClient().rpc("mark_order_item_delivered", {
      p_order_item_id: itemId,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setItems((current) => current.filter((item) => item.order_item_id !== itemId));
      refresh();
    }
    setWorkingId(null);
  }

  async function enableSound() {
    const AudioContextClass = window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      setError("Este navegador no permite reproducir notificaciones de sonido.");
      return;
    }

    const context = audioContextRef.current ?? new AudioContextClass();
    audioContextRef.current = context;
    try {
      await context.resume();
    } catch {
      setError("No se pudo activar el sonido. Revisa los permisos del navegador.");
      return;
    }
    if (context.state !== "running") {
      setError("No se pudo activar el sonido. Revisa los permisos del navegador.");
      return;
    }

    playNotification(context);
    setSoundReady(true);
    setError(null);
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setError("Este navegador no permite notificaciones.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission !== "granted") {
      setError("No se permitieron las notificaciones. Revisa los permisos del navegador.");
    }
  }

  const grouped = items.reduce<Map<string, CafeQueueItem[]>>((groups, item) => {
    const orderItems = groups.get(item.order_id) ?? [];
    orderItems.push(item);
    groups.set(item.order_id, orderItems);
    return groups;
  }, new Map());

  return (
    <div>
      <QueueStatus status={status} onRefresh={refresh}/>
      {!soundReady ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <p className="text-sm text-orange-900">
            Alerta de nuevos pedidos.
          </p>
          <button
            type="button"
            onClick={() => void enableSound()}
            className="min-h-11 shrink-0 rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-700"
          >
            Activar sonido
          </button>
        </div>
      ) : null}

      {role === "barista" && notificationPermission !== "granted" ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-900">
            Avisar también en segundo plano.
          </p>
          <button
            type="button"
            onClick={() => void enableNotifications()}
            disabled={notificationPermission === "denied"}
            className="min-h-11 shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {notificationPermission === "denied" ? "Bloqueadas" : "Activar notificaciones"}
          </button>
        </div>
      ) : null}

      {error ? <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {grouped.size === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white px-4 py-6 text-center">
          <p className="font-medium">No hay pedidos de café pendientes</p>

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
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Mesa {order.table_number}{order.customer_name ? ` · ${order.customer_name}` : ""}
                    </p>
                  </div>
                  <time className="text-sm font-medium text-[var(--muted)]">{formatTime(order.created_at)}</time>
                </header>
                <ul className="divide-y divide-[var(--border)]">
                  {orderItems.map((item) => (
                    <li key={item.order_item_id} className="flex items-center justify-between gap-2 py-2">
                      <div>
                        <p className="font-medium">{item.quantity} × {item.item_name}</p>

                      </div>
                      <button
                        type="button"
                        disabled={workingId === item.order_item_id}
                        onClick={() => markDelivered(item.order_item_id)}
                        className="min-h-11 shrink-0 rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
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

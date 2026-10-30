import type { OpenOrder } from "@/lib/types";
import { elapsedLabel, orderDurations } from "@/lib/order-board";
export function OrderTimers({ order, now }: { order: OpenOrder; now: number }) {
  const durations = orderDurations(order, now);
  return <dl className={`grid ${order.payment_methods?.length?"grid-cols-1":"grid-cols-2"} gap-2 rounded-lg bg-stone-50 px-2 py-1.5 text-xs`}>
    <div><dt className="text-[var(--muted)]">Preparación</dt><dd data-testid="preparation-time" className="mt-0.5 text-sm font-semibold tabular-nums">{elapsedLabel(durations.preparation)}</dd></div>
    {!order.payment_methods?.length?<div><dt className="text-[var(--muted)]">{durations.accountStopped ? "Cuenta cerrada" : "Cuenta abierta"}</dt><dd data-testid="account-time" className="mt-0.5 text-sm font-semibold tabular-nums">{elapsedLabel(durations.account)}</dd></div>:null}
  </dl>;
}

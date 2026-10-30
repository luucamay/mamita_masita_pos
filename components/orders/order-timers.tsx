import type { OpenOrder } from "@/lib/types";
import { elapsedLabel, orderDurations } from "@/lib/order-board";
export function OrderTimers({ order, now }: { order: OpenOrder; now: number }) {
  const durations = orderDurations(order, now);
  return <dl className="grid grid-cols-2 gap-3 rounded-xl bg-stone-50 px-3 py-2 text-xs">
    <div><dt className="text-[var(--muted)]">Preparación{durations.preparationStopped ? " finalizada" : ""}</dt><dd data-testid="preparation-time" className="mt-1 text-base font-semibold tabular-nums">{elapsedLabel(durations.preparation)}</dd></div>
    <div><dt className="text-[var(--muted)]">{durations.accountStopped ? "Cuenta cerrada" : "Cuenta abierta"}</dt><dd data-testid="account-time" className="mt-1 text-base font-semibold tabular-nums">{elapsedLabel(durations.account)}</dd></div>
  </dl>;
}

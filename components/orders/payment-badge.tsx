import { paymentPresentation } from "@/lib/payment";
import type { OpenOrder } from "@/lib/types";

export function PaymentBadge({ order }: { order: Pick<OpenOrder, "status" | "paid_at" | "payment_method" | "payment_methods"> }) {
  const payment = paymentPresentation(order);
  const palette = payment.kind === "cash" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : payment.kind === "qr" || payment.kind==="mixed" ? "border-teal-200 bg-teal-50 text-teal-700"
    : payment.kind === "card" ? "border-violet-200 bg-violet-50 text-violet-800"
    : "border-stone-200 bg-stone-50 text-stone-700";
  return (
    <span data-payment-kind={payment.kind} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${palette}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
        {payment.kind === "qr" || payment.kind==="mixed" ? <><path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h2v2h-2zM19 15h2v6h-6v-2" /></>
          : payment.kind === "cash" ? <><rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M5 9v6M19 9v6" /></>
          : payment.kind === "card" ? <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>
          : <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
      </svg>
      <span><span className="sr-only">Pago: </span>{payment.label}</span>
    </span>
  );
}

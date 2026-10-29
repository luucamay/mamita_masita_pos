import type { OpenOrder } from "./types";

export function paymentPresentation(order: Pick<OpenOrder, "status" | "paid_at" | "payment_method">) {
  if (order.status !== "pagado" && order.status !== "archivado") return { kind: "unpaid", label: "Sin cobrar" } as const;
  if (!order.paid_at) return { kind: "unknown", label: "Pago sin confirmar" } as const;
  switch (order.payment_method) {
    case "cash": return { kind: "cash", label: "Efectivo" } as const;
    case "qr": return { kind: "qr", label: "QR" } as const;
    case "card": return { kind: "card", label: "Tarjeta" } as const;
    default: return { kind: "unknown", label: "Medio no registrado" } as const;
  }
}

import type { OpenOrder } from "./types";

export function paymentPresentation(order: Pick<OpenOrder, "status" | "paid_at" | "payment_method" | "payment_methods">) {
  if (!order.paid_at && order.status !== "pagado" && order.status !== "archivado") return { kind: "unpaid", label: "Sin cobrar" } as const;
  if (!order.paid_at) return { kind: "unknown", label: "Pago sin confirmar" } as const;
  if(order.payment_methods?.includes("cash")&&order.payment_methods?.includes("qr"))return{kind:"mixed",label:"Efectivo + QR"} as const;
  switch (order.payment_method) {
    case "cash": return { kind: "cash", label: "Efectivo" } as const;
    case "qr": return { kind: "qr", label: "QR" } as const;
    case "card": return { kind: "card", label: "Tarjeta" } as const;
    default: return { kind: "unknown", label: "Medio no registrado" } as const;
  }
}

export type PricingContext = { date: string; discount_bps: number; revision: number; expires_at: string; checked_at?: string };
export type DailyPromotion = { promotion_date: string; discount_bps: number; active: boolean; revision: number; updated_at: string };
export function percentToBasisPoints(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(normalized)) throw new Error("Usa un porcentaje con hasta dos decimales.");
  const [whole, decimal = ""] = normalized.split(".");
  const bps = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  if (bps < 1 || bps > 10000) throw new Error("El descuento debe ser de 0,01 a 100 %. Para quitarlo, desactiva la promoción.");
  return bps;
}
export function discountLabel(bps: number) { return `${Number((bps / 100).toFixed(2)).toString().replace(".", ",")}%`; }
export function isPricingContext(value: unknown): value is PricingContext {
  if (!value || typeof value !== "object") return false;
  const q = value as PricingContext;
  return /^\d{4}-\d{2}-\d{2}$/.test(q.date) && Number.isInteger(q.discount_bps) && q.discount_bps >= 0 && q.discount_bps <= 10000 && Number.isSafeInteger(q.revision) && q.revision >= 0 && typeof q.expires_at === "string" && Number.isFinite(Date.parse(q.expires_at));
}

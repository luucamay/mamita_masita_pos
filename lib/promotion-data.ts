import "server-only";
import { requireRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isPricingContext, type DailyPromotion, type PricingContext } from "@/lib/promotions";

export async function getPricingContext(): Promise<{ pricing: PricingContext | null; pricingError: string | null }> {
  await requireRoles(["admin", "staff"]);
  const { data, error } = await (await createClient()).rpc("get_order_pricing_context");
  if (error || !isPricingContext(data)) return { pricing: null, pricingError: "No se pudo verificar la promoción vigente. Actualiza antes de confirmar pedidos." };
  return { pricing: data, pricingError: null };
}
export async function getPromotionsData() {
  await requireRoles(["admin"]);
  const context = await getPricingContext();
  if (!context.pricing) return { ...context, promotions: [] as DailyPromotion[] };
  const { data, error } = await (await createClient()).from("daily_promotions").select("promotion_date,discount_bps,active,revision,updated_at").gte("promotion_date", context.pricing.date).order("promotion_date");
  return { ...context, pricingError: error ? "No se pudieron cargar las promociones. Intenta actualizar." : null, promotions: (data ?? []) as DailyPromotion[] };
}

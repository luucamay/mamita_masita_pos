import { discountLabel } from "@/lib/promotions";
import { PromotionsIcon } from "@/components/icons";
export function DiscountBadge({ bps }: { bps?: number }) {
  if (!bps || bps < 0) return null;
  return <span data-discount-bps={bps} title={`Descuento del ${discountLabel(bps)}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-orange-200 bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-900"><PromotionsIcon className="h-4 w-4" /><span><span className="sr-only">Descuento </span>{discountLabel(bps)}</span></span>;
}

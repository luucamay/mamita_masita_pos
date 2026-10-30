import { discountLabel } from "@/lib/promotions";
export function DiscountBadge({ bps }: { bps?: number }) {
  if (!bps || bps < 0) return null;
  return <span data-discount-bps={bps} className="inline-flex shrink-0 items-center rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-900"><span className="sr-only">Descuento </span>{discountLabel(bps)}</span>;
}

import { notFound } from "next/navigation";
import { requireRoles } from "@/lib/auth";
import { PromotionsPanel } from "@/components/promotions/promotions-panel";
export default async function QaPromotions() {
  if(process.env.MAMITA_QA_BUILD!=="true") notFound();
  await requireRoles(["admin"]);
  return <PromotionsPanel pricing={{date:"2026-10-29",discount_bps:0,revision:0,expires_at:"2026-10-30T04:00:00Z"}} promotions={[]} pricingError={null}/>;
}

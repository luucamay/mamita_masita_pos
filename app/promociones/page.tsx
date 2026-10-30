import { getPromotionsData } from "@/lib/promotion-data";
import { PromotionsPanel } from "@/components/promotions/promotions-panel";
export default async function PromotionsPage() { return <PromotionsPanel {...await getPromotionsData()} />; }

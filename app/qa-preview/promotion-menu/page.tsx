import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getMenuData } from "@/lib/menu";
import { MenuHome } from "@/components/menu/menu-home";
export default async function QaPromotionMenu(){
  if(process.env.MAMITA_QA_BUILD!=="true")notFound();
  const menu=await getMenuData();
  // This synthetic quote is confined to the authenticated QA build; it never bypasses the order RPC.
  const bps=(await cookies()).get("p06-qa-rate")?.value==="2000"?2000:1500;
  return <MenuHome categories={menu.categories} items={menu.items} loadError={menu.error} pricing={{date:"2026-10-29",discount_bps:bps,revision:bps===1500?1:2,expires_at:"2026-10-30T04:00:00Z"}}/>;
}

import { MenuHome } from "@/components/menu/menu-home";
import { getMenuData } from "@/lib/menu";
import { getPricingContext } from "@/lib/promotion-data";

export default async function HomePage() {
  const [{ categories, items, error }, pricing] = await Promise.all([getMenuData(), getPricingContext()]);

  return (
    <MenuHome categories={categories} items={items} loadError={error} {...pricing} />
  );
}

import { MenuHome } from "@/components/menu/menu-home";
import { getMenuData } from "@/lib/menu";

export default async function HomePage() {
  const { categories, items, error } = await getMenuData();

  return (
    <MenuHome categories={categories} items={items} loadError={error} />
  );
}

import { createClient } from "@/lib/supabase/server";
import type { Category, MenuItem } from "@/lib/types";

export async function getMenuData(): Promise<{
  categories: Category[];
  items: MenuItem[];
  error: string | null;
}> {
  const supabase = await createClient();

  const [categoriesResult, itemsResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, slug, queue_type, sort_order, active")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("menu_items")
      .select(
        "id, category_id, name, price, active, sort_order, categories(id, name, slug, queue_type)",
      )
      .eq("active", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (categoriesResult.error || itemsResult.error) {
    return {
      categories: [],
      items: [],
      error:
        categoriesResult.error?.message ??
        itemsResult.error?.message ??
        "No se pudo cargar el menú",
    };
  }

  const items = (itemsResult.data ?? []).map((item) => ({
    ...item,
    price: Number(item.price),
    categories: Array.isArray(item.categories)
      ? (item.categories[0] ?? null)
      : (item.categories ?? null),
  })) as MenuItem[];

  return {
    categories: (categoriesResult.data ?? []) as Category[],
    items,
    error: null,
  };
}

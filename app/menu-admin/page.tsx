import { requireRoles } from "@/lib/auth";
import { MenuAdmin } from "@/components/menu/menu-admin";
import { createClient } from "@/lib/supabase/server";
import type { Category, MenuItem } from "@/lib/types";

export default async function MenuAdminPage() {
  await requireRoles(["admin"]);
  const supabase = await createClient();

  const [categoriesResult, itemsResult] = await Promise.all([
    supabase.from("categories").select("id, name, slug, queue_type, sort_order, active").order("sort_order"),
    supabase.from("menu_items").select("id, category_id, name, price, active, sort_order").order("sort_order"),
  ]);
  if (categoriesResult.error || itemsResult.error) {
    return <main className="p-8"><p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">No se pudo cargar el administrador del menú.</p></main>;
  }
  return <MenuAdmin initialCategories={(categoriesResult.data ?? []) as Category[]} initialItems={(itemsResult.data ?? []).map((item) => ({ ...item, price: Number(item.price) })) as MenuItem[]} />;
}

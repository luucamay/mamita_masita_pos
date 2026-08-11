import { redirect } from "next/navigation";
import { MenuAdmin } from "@/components/menu/menu-admin";
import { createClient } from "@/lib/supabase/server";
import type { Category, MenuItem } from "@/lib/types";

export default async function MenuAdminPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/login?next=/menu-admin");
  const { data: profile } = await supabase.from("profiles").select("role, active").eq("id", userData.user.id).maybeSingle();
  if (profile?.role !== "admin" || profile.active !== true) redirect("/");

  const [categoriesResult, itemsResult] = await Promise.all([
    supabase.from("categories").select("id, name, slug, queue_type, sort_order, active").order("sort_order"),
    supabase.from("menu_items").select("id, category_id, name, price, active, sort_order").order("sort_order"),
  ]);
  if (categoriesResult.error || itemsResult.error) {
    return <main className="p-8"><p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">No se pudo cargar el administrador del menú.</p></main>;
  }
  return <MenuAdmin initialCategories={(categoriesResult.data ?? []) as Category[]} initialItems={(itemsResult.data ?? []).map((item) => ({ ...item, price: Number(item.price) })) as MenuItem[]} />;
}

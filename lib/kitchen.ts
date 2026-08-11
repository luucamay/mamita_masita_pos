import { createClient } from "@/lib/supabase/server";
import type { KitchenQueueItem } from "@/lib/types";

export async function getKitchenQueue(): Promise<{
  items: KitchenQueueItem[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_kitchen_tickets")
    .select(
      "order_id, order_number, table_number, customer_name, order_status, order_item_id, item_name, quantity, unit_price, line_total, item_status, printed_at, created_at",
    )
    .eq("item_status", "pending")
    .order("created_at", { ascending: true });

  if (error) return { items: [], error: error.message };

  return {
    items: (data ?? []).map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      line_total: Number(item.line_total),
    })) as KitchenQueueItem[],
    error: null,
  };
}

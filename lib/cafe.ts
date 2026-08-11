import { createClient } from "@/lib/supabase/server";
import type { CafeQueueItem } from "@/lib/types";

export async function getCafeQueue(): Promise<{
  items: CafeQueueItem[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_cafe_queue")
    .select(
      "order_id, order_number, table_number, customer_name, order_status, order_item_id, item_name, quantity, unit_price, line_total, item_status, created_at",
    )
    .order("created_at", { ascending: true });

  if (error) return { items: [], error: error.message };

  return {
    items: (data ?? []).map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      line_total: Number(item.line_total),
    })) as CafeQueueItem[],
    error: null,
  };
}

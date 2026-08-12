import { createClient } from "@/lib/supabase/server";
import type { OpenOrder } from "@/lib/types";

export async function getOpenOrders(): Promise<{
  orders: OpenOrder[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_open_orders")
    .select(
      "id, order_number, table_number, customer_name, status, created_at, delivered_at, paid_at, item_count, total",
    )
    .order("created_at", { ascending: false });

  if (error) return { orders: [], error: error.message };

  return {
    orders: (data ?? []).map((order) => ({
      ...order,
      item_count: Number(order.item_count),
      total: Number(order.total ?? 0),
    })) as OpenOrder[],
    error: null,
  };
}

export async function getClosedOrders(): Promise<{
  orders: OpenOrder[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_order_detail")
    .select(
      "id, order_number, table_number, customer_name, status, payment_method, created_at, delivered_at, paid_at, total, items",
    )
    .in("status", ["pagado", "archivado"])
    .order("paid_at", { ascending: false, nullsFirst: false });

  if (error) return { orders: [], error: error.message };

  return {
    orders: (data ?? []).map((order) => ({
      ...order,
      item_count: Array.isArray(order.items) ? order.items.length : 0,
      total: Number(order.total ?? 0),
    })) as OpenOrder[],
    error: null,
  };
}

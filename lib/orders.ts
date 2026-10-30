import { createClient } from "@/lib/supabase/server";
import { requireRoles } from "@/lib/auth";
import type { OpenOrder } from "@/lib/types";

export async function getOpenOrders(): Promise<{
  orders: OpenOrder[];
  error: string | null;
}> {
  await requireRoles(["admin", "staff"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id,order_number,table_number,customer_name,status,created_at,delivered_at,paid_at,total,subtotal,discount_bps,discount_amount,order_items(id,status)",
    )
    .in("status", ["pendiente", "confirmado", "entregado"])
    .order("created_at", { ascending: false });

  if (error) return { orders: [], error: error.message };

  return {
    orders: (data ?? []).map((order) => ({
      ...order,
      item_count: order.order_items.filter((item) => item.status !== "voided").length,
      total: Number(order.total ?? 0),
    })) as OpenOrder[],
    error: null,
  };
}

export async function getClosedOrders(): Promise<{
  orders: OpenOrder[];
  error: string | null;
}> {
  await requireRoles(["admin", "staff"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id,order_number,table_number,customer_name,status,payment_method,created_at,delivered_at,paid_at,total,subtotal,discount_bps,discount_amount,order_items(id,status)",
    )
    .in("status", ["pagado", "archivado"])
    .order("paid_at", { ascending: false, nullsFirst: false });

  if (error) return { orders: [], error: error.message };

  return {
    orders: (data ?? []).map((order) => ({
      ...order,
      item_count: order.order_items.filter((item) => item.status !== "voided").length,
      total: Number(order.total ?? 0),
    })) as OpenOrder[],
    error: null,
  };
}

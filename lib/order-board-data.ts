import "server-only";
import { requireRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizeOrderBoard, type OrderBoard } from "@/lib/order-board";
export async function getOrderBoard(closed = false, selected: string | null = null): Promise<{ board: OrderBoard | null; error: string | null }> {
  await requireRoles(["admin", "staff"]);
  const { data, error } = await (await createClient()).rpc("get_orders_board", { p_closed: closed, p_selected_order: selected });
  if (error) return { board: null, error: "No se pudieron cargar los pedidos. Intenta actualizar." };
  try { return { board: normalizeOrderBoard(data), error: null }; }
  catch { return { board: null, error: "No se pudo verificar la respuesta de pedidos." }; }
}

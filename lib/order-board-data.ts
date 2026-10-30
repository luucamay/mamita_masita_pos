import "server-only";
import { requireRoles, type getActiveAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizeOrderBoard, type OrderBoard } from "@/lib/order-board";
export async function getOrderBoard(closed = false, selected: string | null = null, page=1, verifiedAccess?:Awaited<ReturnType<typeof getActiveAccess>>): Promise<{ board: OrderBoard | null; error: string | null }> {
  // Route handlers pass their freshly verified access. React cache deduplicates
  // Server Components, but is not a request cache for route handlers.
  const access=verifiedAccess??await requireRoles(["admin", "staff"]);
  if(!access.profile.active||!["admin","staff"].includes(access.profile.role))return{board:null,error:"Acceso no autorizado"};
  const { data, error } = await (await createClient()).rpc("get_orders_board_page", { p_closed: closed, p_selected_order: selected, p_page:page });
  if (error) return { board: null, error: "No se pudieron cargar los pedidos. Intenta actualizar." };
  try { return { board: normalizeOrderBoard(data), error: null }; }
  catch { return { board: null, error: "No se pudo verificar la respuesta de pedidos." }; }
}

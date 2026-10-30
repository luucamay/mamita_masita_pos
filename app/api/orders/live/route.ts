import { NextResponse } from "next/server";
import { getActiveAccess } from "@/lib/auth";
import { homeForRole } from "@/lib/permissions";
import { getOrderBoard } from "@/lib/order-board-data";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const access = await getActiveAccess();
  if (!access) return NextResponse.json({ error: "Sesión no disponible", redirectTo: "/login?reason=inactive" }, { status: 401, headers });
  if (!["admin", "staff"].includes(access.profile.role)) return NextResponse.json({ error: "Acceso no autorizado", redirectTo: homeForRole(access.profile.role) }, { status: 403, headers });
  const params = new URL(request.url).searchParams, view = params.get("view") ?? "active", selected = params.get("selected");
  if (!["active", "closed"].includes(view) || [...params.keys()].some(key => params.getAll(key).length !== 1) || selected !== null && !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(selected)) return NextResponse.json({ error: "Filtro inválido" }, { status: 400, headers });
  const { board, error } = await getOrderBoard(view === "closed", selected);
  if (!board || error) return NextResponse.json({ error }, { status: 503, headers });
  return NextResponse.json({ orders: board.orders, selected: board.selected, server_time: board.serverTime }, { headers });
}

import { validReportDate } from "@/lib/report-filters";
import { NextResponse } from "next/server";
import { getActiveAccess } from "@/lib/auth";
import { homeForRole } from "@/lib/permissions";
import { getOrderBoard } from "@/lib/order-board-data";
import { parseBoardPage } from "@/lib/order-board";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  const started=performance.now();
  const access = await getActiveAccess();
  if (!access) return NextResponse.json({ error: "Sesión no disponible", redirectTo: "/login?reason=inactive" }, { status: 401, headers });
  if (!["admin", "staff"].includes(access.profile.role)) return NextResponse.json({ error: "Acceso no autorizado", redirectTo: homeForRole(access.profile.role) }, { status: 403, headers });
  const params = new URL(request.url).searchParams, view = params.get("view") ?? "active", selected = params.get("selected");
  if (!["active", "closed"].includes(view) || [...params.keys()].some(key => params.getAll(key).length !== 1) || selected !== null && !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(selected)) return NextResponse.json({ error: "Filtro inválido" }, { status: 400, headers });
  let page;try{page=parseBoardPage(params.get("page"),view==="closed");}catch{return NextResponse.json({error:"Página inválida"},{status:400,headers});}
  const date=params.get("date"),all=params.get("all");
  if(date!==null&&!validReportDate(date)||all!==null&&all!=="1")return NextResponse.json({error:"Fecha inválida"},{status:400,headers});
  const authorized=performance.now();
  const { board, error } = await getOrderBoard(view === "closed", selected,page,access,date,all==="1");
  if (!board || error) return NextResponse.json({ error }, { status: 503, headers });
  const fetched=performance.now();
  const response=NextResponse.json({ orders: board.orders, selected: board.selected, server_time: board.serverTime, pagination:board.pagination, closed_filter:board.closedFilter }, { headers });
  response.headers.set("Server-Timing",`access;dur=${(authorized-started).toFixed(1)}, data;dur=${(fetched-authorized).toFixed(1)}, encode;dur=${(performance.now()-fetched).toFixed(1)}`);
  return response;
}

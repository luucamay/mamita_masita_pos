import { validReportDate } from "@/lib/report-filters";
import Link from "next/link";
import { LiveOrders } from "@/components/orders/live-orders";
import { getOrderBoard } from "@/lib/order-board-data";
import { parseBoardPage } from "@/lib/order-board";

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string; date?:string; all?:string }>;
}) {
  const query=await searchParams;
  const view = query.view === "closed" ? "closed" : "active";
  let page=1,invalid=false;try{page=parseBoardPage(query.page,view==="closed");}catch{invalid=true;}
  const date=typeof query.date==="string"&&validReportDate(query.date)?query.date:null,allDates=query.all==="1";
  if(query.date&&!date||query.all&&query.all!=="1")invalid=true;
  const { board, error } = await getOrderBoard(view === "closed",null,page,undefined,date,allDates);

  const navigation=<nav aria-label="Vista de pedidos" className="flex w-fit rounded-lg border border-[var(--border)] bg-white p-0.5">{[{value:"active",label:"Activos",href:"/pedidos"},{value:"closed",label:"Cerrados",href:"/pedidos?view=closed"}].map(tab=><Link key={tab.value} href={tab.href} aria-current={view===tab.value?"page":undefined} className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold ${view===tab.value?"bg-orange-500 text-white":"text-[var(--muted)]"}`}>{tab.label}</Link>)}</nav>;
  return <div className="px-3 py-3 sm:px-4">
    {invalid?<p role="alert" className="mb-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Página inválida. Se muestra la primera página.</p>:null}
    {error||!board?<><h1 className="text-xl font-semibold">Pedidos</h1><p role="alert" className="py-2 text-sm text-red-700">No se pudieron cargar los pedidos: {error}</p></>:<LiveOrders key={`${view}-${page}`} initial={board} closed={view==="closed"} page={page} navigation={navigation} filterDate={date}/>}
  </div>;
}

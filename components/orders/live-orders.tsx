"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizeOrderBoard, type OrderBoard } from "@/lib/order-board";
import { createLiveRefresh } from "@/lib/live-refresh";
import { formatOrderTime } from "@/lib/date-time";
import { OrdersList } from "./orders-list";
import Link from "next/link";
export function LiveOrders({ initial, closed = false, page=1, navigation, filterDate=null }: { initial: OrderBoard; closed?: boolean; page?:number; navigation?:ReactNode;filterDate?:string|null }) {
  const router = useRouter();
  const [allDatesChoice,setAllDatesChoice]=useState(initial.closedFilter?.all_dates??false);
  const [board,setBoard] = useState(initial), [selected,setSelected] = useState<string|null>(null), [resolved,setResolved] = useState<string|null>(null);
  const [now,setNow] = useState(Date.parse(initial.serverTime)), [connection,setConnection] = useState("connecting"), [error,setError] = useState("");
  const selectedRef = useRef(selected), refreshRef = useRef<((immediate?:boolean)=>void)|null>(null);
  const anchor = useRef({ server: Date.parse(initial.serverTime), monotonic: 0 }), latest = useRef(Date.parse(initial.serverTime));
  const select = useCallback((id:string|null) => { if(selectedRef.current===id)return; selectedRef.current=id; setSelected(id); refreshRef.current?.(true); },[]);
  useEffect(() => {
    if(Date.parse(initial.serverTime)>=latest.current){latest.current=Date.parse(initial.serverTime);setBoard(initial);anchor.current={server:latest.current,monotonic:performance.now()};setNow(latest.current);}
  },[initial]);
  useEffect(() => {
    anchor.current={server:Date.parse(initial.serverTime),monotonic:performance.now()};
    if(closed)return;
    const timer=setInterval(()=>{if(document.visibilityState==="visible")setNow(anchor.current.server+performance.now()-anchor.current.monotonic);},1000);
    return()=>clearInterval(timer);
  },[closed]); // One local monotonic clock for the entire board, never a DB poll per second.
  useEffect(() => {
    let alive=true;
    if(!navigator.onLine)setConnection("offline");
    const client=createClient();
    const refresh=createLiveRefresh({
      canRun:()=>navigator.onLine&&document.visibilityState==="visible",
      load:async(signal)=>{
        const selection=selectedRef.current, params=new URLSearchParams({view:closed?"closed":"active"});if(closed){params.set("page",String(page));if(filterDate)params.set("date",filterDate);if(initial.closedFilter?.all_dates)params.set("all","1");}if(selection)params.set("selected",selection);
        const began=performance.now();const response=await fetch(`/api/orders/live?${params}`,{cache:"no-store",signal});const data=await response.json();
        if(response.status===401||response.status===403){refresh.dispose();setBoard(current=>({...current,orders:[],selected:null}));setSelected(null);if(["/login?reason=inactive","/cocina","/cafe","/","/historial"].includes(data.redirectTo))router.replace(data.redirectTo);throw new Error("Tu acceso a Pedidos cambió. Inicia sesión de nuevo.");}
        if(!response.ok)throw new Error("No se pudieron actualizar los pedidos. Puedes reintentar.");
        return {board:normalizeOrderBoard(data),selection,halfRoundTrip:(performance.now()-began)/2};
      },
      apply:({board,selection,halfRoundTrip})=>{if(!alive||Date.parse(board.serverTime)<latest.current)return;latest.current=Date.parse(board.serverTime);setBoard(board);setResolved(selection);anchor.current={server:latest.current+halfRoundTrip,monotonic:performance.now()};setNow(anchor.current.server);setError("");},
      failed:()=>{if(alive)setError("No se pudieron actualizar los pedidos. Se conserva la última lectura; vuelve a intentar.");},
    });
    refreshRef.current=refresh.request;
    const channel=client.channel(`orders-board-${crypto.randomUUID()}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"orders"},()=>refresh.request())
      .on("postgres_changes",{event:"*",schema:"public",table:"order_items"},()=>refresh.request())
      .subscribe(status=>{if(!alive)return;if(status==="SUBSCRIBED"){setConnection("live");refresh.request(true);}else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"||status==="CLOSED")setConnection(navigator.onLine?"retrying":"offline");});
    function reconnect(){if(!alive)return;setConnection(navigator.onLine?channel.state==="joined"?"live":"connecting":"offline");refresh.request(true);}
    function offline(){setConnection("offline");}
    function manual(event:Event){event.preventDefault();refresh.request(true);}
    window.addEventListener("mamita:refresh",manual);
    window.addEventListener("online",reconnect);window.addEventListener("offline",offline);window.addEventListener("focus",reconnect);document.addEventListener("visibilitychange",reconnect);
    const heartbeat=setInterval(()=>refresh.request(true),30000);
    return()=>{window.removeEventListener("mamita:refresh",manual);alive=false;refreshRef.current=null;refresh.dispose();clearInterval(heartbeat);window.removeEventListener("online",reconnect);window.removeEventListener("offline",offline);window.removeEventListener("focus",reconnect);document.removeEventListener("visibilitychange",reconnect);void client.removeChannel(channel);};
  },[closed,page,router,filterDate]);
  const closedHref=(next:number)=>{const params=new URLSearchParams({view:"closed",page:String(next)});if(filterDate)params.set("date",filterDate);if(board.closedFilter?.all_dates)params.set("all","1");return `/pedidos?${params}`;};
  return <div className="space-y-2">
    <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><h1 className="text-xl font-semibold">Pedidos</h1><p role="status" data-testid="live-status" className={`text-right text-xs ${error||connection==="offline"||connection==="retrying"?"text-amber-900":"text-[var(--muted)]"}`}>{error?"Pendiente de actualizar":connection==="live"?"En vivo":connection==="offline"?"Sin conexión":connection==="retrying"?"Reconectando":"Conectando…"}<span className="ml-2">Última lectura: {formatOrderTime(board.serverTime)}</span></p></header>
    <div className="flex flex-wrap items-center justify-between gap-2">{navigation}{closed?<form action="/pedidos" className="flex flex-wrap items-center gap-1.5"><input type="hidden" name="view" value="closed"/><input type="date" name="date" disabled={allDatesChoice} aria-label="Fecha de pedidos cerrados" defaultValue={board.closedFilter?.date} key={board.closedFilter?.date} className="min-h-11 min-w-0 rounded-lg border border-[var(--border)] bg-white px-2 text-sm"/><label className="flex min-h-11 items-center gap-1.5 px-1 text-xs"><input type="checkbox" name="all" value="1" checked={allDatesChoice} onChange={event=>setAllDatesChoice(event.target.checked)}/>Todo el historial</label><button type="submit" className="min-h-11 rounded-lg bg-orange-500 px-3 text-sm font-semibold text-white">Filtrar</button></form>:null}</div>
    {error?<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</p>:null}
    {board.pagination ? <nav aria-label="Páginas de pedidos cerrados" className="flex flex-wrap items-center justify-between gap-1 text-xs"><p>Página {board.pagination.page} de {board.pagination.pages} · {board.pagination.total} pedidos cerrados</p><div className="flex gap-4">{board.pagination.page>1?<Link href={closedHref(board.pagination.page-1)} className="inline-flex min-h-11 items-center font-semibold text-orange-800">Anteriores</Link>:null}{board.pagination.page<board.pagination.pages?<Link href={closedHref(board.pagination.page+1)} className="inline-flex min-h-11 items-center font-semibold text-orange-800">Siguientes</Link>:null}</div></nav>:null}
    <OrdersList orders={board.orders} closed={closed} nowMs={now} liveSelected={board.selected} selectionResolvedFor={resolved} onSelectionChange={select}/>
  </div>;
}

"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizeOrderBoard, type OrderBoard } from "@/lib/order-board";
import { createLiveRefresh } from "@/lib/live-refresh";
import { formatOrderTime } from "@/lib/date-time";
import { OrdersList } from "./orders-list";
import Link from "next/link";
export function LiveOrders({ initial, closed = false, page=1 }: { initial: OrderBoard; closed?: boolean; page?:number }) {
  const router = useRouter();
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
        const selection=selectedRef.current, params=new URLSearchParams({view:closed?"closed":"active"});if(closed)params.set("page",String(page));if(selection)params.set("selected",selection);
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
    window.addEventListener("online",reconnect);window.addEventListener("offline",offline);window.addEventListener("focus",reconnect);document.addEventListener("visibilitychange",reconnect);
    const heartbeat=setInterval(()=>refresh.request(true),30000);
    return()=>{alive=false;refreshRef.current=null;refresh.dispose();clearInterval(heartbeat);window.removeEventListener("online",reconnect);window.removeEventListener("offline",offline);window.removeEventListener("focus",reconnect);document.removeEventListener("visibilitychange",reconnect);void client.removeChannel(channel);};
  },[closed,page,router]);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm"><p role="status" data-testid="live-status" className={error||connection==="offline"||connection==="retrying"?"text-amber-900":"text-[var(--muted)]"}>{error?"Datos pendientes de actualizar":connection==="live"?"En vivo":connection==="offline"?"Sin conexión. Los pedidos pueden estar desactualizados.":connection==="retrying"?"Reconectando. Los pedidos pueden estar desactualizados.":"Conectando actualizaciones…"}<span className="ml-2 text-xs">Última lectura: {formatOrderTime(board.serverTime)}</span></p><button type="button" onClick={()=>refreshRef.current?.(true)} className="min-h-11 rounded-xl border border-[var(--border)] px-4 font-semibold">Actualizar pedidos</button></div>
    {error?<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</p>:null}
    {board.pagination ? <nav aria-label="Páginas de pedidos cerrados" className="flex flex-wrap items-center justify-between gap-3 text-sm"><p>Página {board.pagination.page} de {board.pagination.pages} · {board.pagination.total} pedidos cerrados</p><div className="flex gap-4">{board.pagination.page>1?<Link href={`/pedidos?view=closed&page=${board.pagination.page-1}`} className="inline-flex min-h-11 items-center font-semibold text-orange-800">Anteriores</Link>:null}{board.pagination.page<board.pagination.pages?<Link href={`/pedidos?view=closed&page=${board.pagination.page+1}`} className="inline-flex min-h-11 items-center font-semibold text-orange-800">Siguientes</Link>:null}</div></nav>:null}
    <OrdersList orders={board.orders} closed={closed} nowMs={now} liveSelected={board.selected} selectionResolvedFor={resolved} onSelectionChange={select}/>
  </div>;
}

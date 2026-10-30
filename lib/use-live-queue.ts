"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createLiveRefresh } from "@/lib/live-refresh";
import type { QueueType } from "@/lib/types";

export function useLiveQueue<T>({queue,initialItems,onInsert}:{queue:QueueType;initialItems:T[];onInsert?:(row:Record<string,string>)=>void}){
  const router=useRouter();
  const [items,setItems]=useState(initialItems),[status,setStatus]=useState("Conectando actualizaciones…");
  const onInsertRef=useRef(onInsert),refreshRef=useRef<((immediate?:boolean)=>void)|null>(null);
  onInsertRef.current=onInsert;
  useEffect(()=>setItems(initialItems),[initialItems]);
  useEffect(()=>{
    let alive=true,connected=false;
    const client=createClient();
    const refresh=createLiveRefresh({
      canRun:()=>navigator.onLine&&document.visibilityState==="visible",
      load:async signal=>{
        const response=await fetch(`/api/queues/live?queue=${queue}`,{cache:"no-store",signal}),data=await response.json();
        if(response.status===401||response.status===403){refresh.dispose();setItems([]);if(["/login?reason=inactive","/cocina","/cafe","/","/historial"].includes(data.redirectTo))router.replace(data.redirectTo);throw Error("Acceso cambiado");}
        if(!response.ok||!Array.isArray(data.items))throw Error("No se pudo actualizar la cola");
        return data.items as T[];
      },
      apply:rows=>{if(alive){setItems(rows);setStatus(connected?"En vivo":"Reconectando. Última lectura recuperada.");}},
      failed:()=>{if(alive)setStatus("No se pudo actualizar. Se conserva la última lectura; reintentando…");},
    });
    refreshRef.current=refresh.request;
    const channel=client.channel(`queue-${queue}-${crypto.randomUUID()}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"order_items"},payload=>{
        const row=payload.new as Record<string,string>;
        if(payload.eventType!=="DELETE"&&row.queue_type!==queue)return;
        if(payload.eventType==="INSERT"&&row.status==="pending")onInsertRef.current?.(row);
        refresh.request();
      })
      // Confirmation or closure can change visibility without an item insert.
      .on("postgres_changes",{event:"*",schema:"public",table:"orders"},()=>refresh.request())
      .subscribe(state=>{if(!alive)return;connected=state==="SUBSCRIBED";setStatus(connected?"En vivo":navigator.onLine?"Reconectando. Los datos pueden estar desactualizados.":"Sin conexión. Los datos pueden estar desactualizados.");if(connected)refresh.request(true);});
    function resume(){if(!alive)return;if(!navigator.onLine){setStatus("Sin conexión. Los datos pueden estar desactualizados.");return;}refresh.request(true);}
    function manual(event:Event){event.preventDefault();refresh.request(true);}
    window.addEventListener("mamita:refresh",manual);
    const timer=setInterval(()=>refresh.request(true),30000);
    window.addEventListener("focus",resume);window.addEventListener("online",resume);window.addEventListener("offline",resume);document.addEventListener("visibilitychange",resume);
    if(!navigator.onLine)setStatus("Sin conexión. Los datos pueden estar desactualizados.");
    return()=>{window.removeEventListener("mamita:refresh",manual);alive=false;refreshRef.current=null;refresh.dispose();clearInterval(timer);window.removeEventListener("focus",resume);window.removeEventListener("online",resume);window.removeEventListener("offline",resume);document.removeEventListener("visibilitychange",resume);void client.removeChannel(channel);};
  },[queue,router]);
  return{items,setItems,status,refresh:()=>refreshRef.current?.(true)};
}

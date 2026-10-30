"use client";
import {useEffect,useRef} from "react";
import {createClient} from "@/lib/supabase/client";
export function useCashboxUpdates(refresh:()=>Promise<unknown>, enabled=true, receipts=false){
 const callback=useRef(refresh);useEffect(()=>{callback.current=refresh;});
 useEffect(()=>{
  if(!enabled)return;
  let alive=true,running=false,again=false;let debounce:ReturnType<typeof setTimeout>|undefined;
  async function load(){if(!alive||!navigator.onLine||document.visibilityState!=="visible")return;if(running){again=true;return;}running=true;try{await callback.current();}catch{/* The view keeps its previous data and displays its own error. */}finally{running=false;if(again&&alive){again=false;request();}}}
  function request(){if(debounce)clearTimeout(debounce);debounce=setTimeout(()=>void load(),250);}
  const client=createClient();let channel=client.channel(`cashbox-${crypto.randomUUID()}`).on("postgres_changes",{event:"*",schema:"public",table:"cash_shifts"},request);
  if(receipts)channel=channel.on("postgres_changes",{event:"*",schema:"public",table:"orders"},request);
  channel.subscribe(state=>{if(state==="SUBSCRIBED")request();});
  const timer=setInterval(()=>void load(),30000);window.addEventListener("focus",request);window.addEventListener("online",request);document.addEventListener("visibilitychange",request);
  return()=>{alive=false;clearInterval(timer);if(debounce)clearTimeout(debounce);window.removeEventListener("focus",request);window.removeEventListener("online",request);document.removeEventListener("visibilitychange",request);void client.removeChannel(channel);};
 },[enabled,receipts]);
}

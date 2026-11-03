"use client";
import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from "react";
import {createClient} from "@/lib/supabase/client";
import {normalizeCashContext,type CashContext} from "@/lib/cashbox";
import {cashAvailability,type CashAvailability} from "@/lib/cash-schedule";
import {useCashboxUpdates} from "@/lib/use-cashbox-updates";

export function useCashClock(context:CashContext|null){
 const [now,setNow]=useState(()=>Date.parse(context?.server_time??"")||0);
 useEffect(()=>{const server=Date.parse(context?.server_time??"");if(!Number.isFinite(server))return;const start=performance.now();const tick=()=>setNow(server+performance.now()-start);tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[context?.server_time]);
 return now;
}
const CashboxContext=createContext<{context:CashContext|null;error:string;state:CashAvailability;allowed:boolean;refresh:()=>Promise<CashContext|null>}>({context:null,error:"",state:"checking",allowed:false,refresh:async()=>null});
export const useCashbox=()=>useContext(CashboxContext);
export function CashboxProvider({enabled,children}:{enabled:boolean;children:ReactNode}){
 const [context,setContext]=useState<CashContext|null>(null),[error,setError]=useState("");
 const request=useRef(0),active=useRef(enabled);active.current=enabled;
 const refresh=useCallback(async()=>{
  if(!active.current)return null;const sequence=++request.current;
  try{const result=await createClient().rpc("get_cashbox_context");if(result.error)throw Error();const next=normalizeCashContext(result.data);if(sequence===request.current&&active.current){setContext(next);setError("");}return next;}
  catch{if(sequence===request.current&&active.current)setError("No se pudo verificar la caja. Actualiza e intenta de nuevo.");return null;}
 },[]);
 useEffect(()=>{if(enabled)void refresh();else{request.current++;setContext(null);setError("");}return()=>{request.current++;};},[enabled]); // eslint-disable-line react-hooks/exhaustive-deps
 useCashboxUpdates(refresh,enabled,true);
 const now=useCashClock(context);
 const state=cashAvailability(context,now);
 const allowed=enabled&&state==="open";
 const value=useMemo(()=>({context,error,state,allowed,refresh}),[context,error,state,allowed,refresh]);
 return <CashboxContext.Provider value={value}>{children}</CashboxContext.Provider>;
}

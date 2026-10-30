"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {normalizeCashContext,type CashContext} from "@/lib/cashbox";
import {useCashboxUpdates} from "@/lib/use-cashbox-updates";
export function CashboxBanner({enabled}:{enabled:boolean}){
 const [context,setContext]=useState<CashContext|null>(null);
 async function load(){const r=await createClient().rpc("get_cashbox_context");if(!r.error)setContext(normalizeCashContext(r.data));}
 useEffect(()=>{if(enabled)void load();else setContext(null);},[enabled]);
 useCashboxUpdates(load,enabled);
 if(!enabled||!context?.enabled||context.shift?.status==="open")return null;
 return <Link href="/caja" className="flex min-h-11 items-center justify-between gap-2 border-b border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-900"><span>{context.shift?`${context.shift.cashier_name} entregó la caja. Falta confirmar la recepción.`:"Abre la caja para registrar cobros."}</span><span className="shrink-0 underline">{context.shift?"Recibir caja":"Abrir caja"}</span></Link>;
}

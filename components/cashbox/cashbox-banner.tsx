"use client";
import Link from "next/link";
import {useCashbox} from "./cashbox-provider";
import {ShiftNotice} from "./shift-notice";
export function CashboxBanner({enabled}:{enabled:boolean}){
 const {context,error,refresh}=useCashbox();
 if(!enabled)return null;
 if(!context)return <div role="status" className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-white px-3 py-2 text-xs text-[var(--muted)]">{error||"Verificando caja…"}{error?<><button type="button" onClick={()=>void refresh()} className="min-h-11 font-semibold text-orange-800 underline">Reintentar</button><Link href="/caja" className="min-h-11 content-center font-semibold text-orange-800">Ir a Caja y turnos</Link></>:null}</div>;
 return <ShiftNotice context={context}/>;
}

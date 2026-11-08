"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import type {CashContext} from "@/lib/cashbox";
import {cashAvailability,cashAvailabilityMessage,isInShiftGrace,reminderDue,shiftGraceEnd,shiftHours,shiftLabel} from "@/lib/cash-schedule";
import {useCashClock} from "./cashbox-provider";
export function ShiftNotice({context,showOpen=true}:{context:CashContext;showOpen?:boolean}){
 const now=useCashClock(context),state=cashAvailability(context,now),shift=context.shift;
 const [snoozed,setSnoozed]=useState(0);const key=shift?`mamita:shift-reminder:${shift.id}`:null;
 useEffect(()=>{setSnoozed(0);if(!key)return;const read=()=>{try{const value=Number(localStorage.getItem(key));setSnoozed(Number.isFinite(value)?value:0);}catch{/* In-memory reminder still works. */}};read();window.addEventListener("storage",read);return()=>window.removeEventListener("storage",read);},[key]);
 function postpone(){const until=now+300000;setSnoozed(until);try{if(key)localStorage.setItem(key,String(until));}catch{/* Storage is optional. */}}
 const due=reminderDue(shift,now,snoozed);
 const graceEnd = shiftGraceEnd(shift);
 if (graceEnd && isInShiftGrace(shift, now)) {
  return <div role="status" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
   <p className="min-w-0 font-medium">Tolerancia del turno de mañana hasta las {graceEnd}. Puedes seguir cobrando mientras preparas el cierre.</p>
   <Link href="/caja" className="inline-flex min-h-11 shrink-0 items-center font-semibold text-orange-800 underline underline-offset-4">Ir al cierre</Link>
  </div>;
 }
 if(state==="open"&&!due&&!showOpen)return null;
 return <div role={state==="expired"||due?"status":undefined} className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-3 py-2 text-xs ${state==="open"&&!due?"border-[var(--border)] bg-white text-[var(--muted)]":"border-orange-200 bg-orange-50 text-orange-900"}`}>
  <div className="min-w-0">
   {state==="open"&&shift?<><p><strong className="text-[var(--ink)]">{shiftLabel(shift)} · {shift.cashier_name}</strong> · {shiftHours(shift)}{due?" · El turno termina en menos de 5 minutos.":""}</p>{due?<p className="mt-1">{graceEnd ? `Preparen el cierre. Hay tolerancia hasta las ${graceEnd}.` : "Preparen el conteo para cerrar y entregar la caja."}</p>:null}</>:<p className="font-medium">{cashAvailabilityMessage(state)}</p>}
  </div>
  <div className="flex shrink-0 items-center gap-3"><Link href="/caja" className="inline-flex min-h-11 items-center font-semibold text-orange-800 underline underline-offset-4">{state==="expired"||due?"Ir al cierre":state==="receive"?"Recibir caja":state==="closed"?"Abrir caja":"Ver caja"}</Link>{due?<button type="button" onClick={postpone} className="min-h-11 rounded-lg border border-orange-200 bg-white px-2 font-semibold text-orange-900">Recordar en 5 min</button>:null}</div>
 </div>;
}

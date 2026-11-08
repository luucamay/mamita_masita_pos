"use client";
import {useRef,useState,type FormEvent} from "react";
import {createClient} from "@/lib/supabase/client";
import {normalizeCashContext,normalizeCashShift,type CashContext,type CashHistory} from "@/lib/cashbox";
import {toCents} from "@/lib/money";
import {formatOrderDate} from "@/lib/date-time";
import {ShiftNotice} from "./shift-notice";
import {useCashbox,useCashClock} from "./cashbox-provider";
import {cashAvailability,shiftLabel,shiftHours} from "@/lib/cash-schedule";
import {Modal} from "@/components/ui/modal";
import {useHeaderRefresh} from "@/lib/use-header-refresh";
import {useCashboxUpdates} from "@/lib/use-cashbox-updates";
import {CashHistoryPanel,ReceiptList,cashMoney} from "./cash-history";
import {DailyCashSummary} from "./daily-summary";
const field="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-base";
const primary="min-h-11 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const secondary="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40";
export function CashboxPanel({initial,history,actorId,role,initialError}:{initial:CashContext|null;history:CashHistory|null;actorId:string;role:string;initialError:string|null}){
 const sharedCashbox=useCashbox();
 const [context,setContext]=useState(initial),[error,setError]=useState(initialError??""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[refreshing,setRefreshing]=useState(false),[generation,setGeneration]=useState(0);
 const [mode,setMode]=useState<"open"|"receive"|"close"|null>(null),[cut,setCut]=useState<CashContext|null>(null),[count,setCount]=useState(""),[withdrawal,setWithdrawal]=useState("0"),[note,setNote]=useState(""),[ack,setAck]=useState(false),[formError,setFormError]=useState("");
 const operation=useRef<{payload:string;id:string}|null>(null);
 const refreshSequence=useRef(0);
 async function refresh(){
  const sequence=++refreshSequence.current;
  setRefreshing(true);
  try{const result=await createClient().rpc("get_cashbox_context");if(result.error)throw Error();const next=normalizeCashContext(result.data);if(sequence!==refreshSequence.current)return null;setContext(next);setError("");return next;}
  catch{if(sequence===refreshSequence.current)setError("No se pudo actualizar la caja. Se conserva la última lectura.");return null;}finally{if(sequence===refreshSequence.current)setRefreshing(false);}
 }
 useHeaderRefresh(()=>{void refresh();setGeneration(v=>v+1);});useCashboxUpdates(refresh,true,true);
 function open(next:"open"|"receive"|"close"){setCut(context);setMode(next);setCount(next==="open"?"0":"");setWithdrawal("0");setNote("");setAck(false);setFormError("");operation.current=null;}
 async function updateCut(){const fresh=await refresh();if(!fresh)return;if(fresh.shift?.id!==cut?.shift?.id||fresh.shift?.status!==cut?.shift?.status){setFormError("Este turno cambió. Cierra esta ventana y revisa la caja.");return;}setCut(fresh);setFormError("");setAck(false);operation.current=null;}
 let counted:number|null=null,removed:number|null=null;
 try{counted=toCents(count.trim().replace(",","."));}catch{}
 try{removed=toCents(withdrawal.trim().replace(",","."));}catch{}
 const expected=cut?.summary.expected_cash??0;
 const difference=counted===null?null:counted-Math.round((mode==="receive"?(cut?.shift?.cash_left??0):expected)*100);
 const needsNote=mode==="close"?(difference!==null&&difference!==0||(removed??0)>0||cut?.shift?.cashier_id!==actorId):mode==="receive"?(difference!==null&&difference!==0||cut?.shift?.cashier_id===actorId):false;
 async function submit(event:FormEvent){
  event.preventDefault();if(busy||!mode||!cut)return;
  if(counted===null||mode==="close"&&(removed===null||removed>counted)){setFormError("Revisa el efectivo contado y el retiro.");return;}
  if(needsNote&&note.trim().length<3){setFormError("Explica la diferencia, el retiro o la operación por el mismo responsable.");return;}
  if(!ack){setFormError("Confirma que contaste el efectivo.");return;}
  const args=mode==="close"?{p_shift_id:cut.shift!.id,p_digest:cut.digest,p_counted:(counted/100).toFixed(2),p_withdrawal:((removed??0)/100).toFixed(2),p_note:note.trim()}:{p_cash:(counted/100).toFixed(2),p_previous_shift:mode==="receive"?cut.shift!.id:null,p_note:note.trim()};
  const payload=JSON.stringify([mode,args]);if(operation.current?.payload!==payload)operation.current={payload,id:crypto.randomUUID()};
  setBusy(true);setFormError("");
  try{
   const result=await createClient().rpc(mode==="close"?"close_cashbox_shift":"open_cashbox_shift",{...args,p_request_id:operation.current.id});
   if(result.error)throw Error(result.error.code==="40001"?result.error.message:result.error.code==="42501"?"No tienes permiso para esta operación.":["22023","55000"].includes(result.error.code)?result.error.message:"No se pudo confirmar el resultado. Reintenta la misma operación.");
   const saved=normalizeCashShift(result.data);
   setContext({...cut,enabled:true,shift:saved,receipts:saved.closing_snapshot,digest:"refresh",summary:{cash:saved.cash_net,qr:saved.qr_net,other:saved.other_net,receipts:saved.receipt_count,expected_cash:saved.opening_cash+saved.cash_net}});
   setNotice(mode==="close"?(saved.is_day_closed?"Día cerrado. El saldo queda en el historial; la siguiente jornada abrirá con Bs 0.":"Cierre registrado. El siguiente cajero de hoy debe contar y recibir el efectivo."):mode==="receive"?"Recepción registrada. Tu turno quedó abierto con el importe contado.":"Turno abierto. Los nuevos cobros se registrarán en esta caja.");
   setMode(null);operation.current=null;setGeneration(v=>v+1);await refresh();void sharedCashbox.refresh();
  }catch(failure){setFormError(failure instanceof Error?failure.message:"No se pudo confirmar la operación.");}finally{setBusy(false);}
 }
 const shift=context?.shift;
 const closingDay=cut?.shift?.shift_slot==="afternoon"||(!!cut?.shift&&new Date(Date.parse(cut.shift.opened_at)-14400000).toISOString().slice(0,10)<new Date(Date.parse(cut.server_time)-14400000).toISOString().slice(0,10));
 const now=useCashClock(context),expired=cashAvailability(context,now)==="expired",outsideHours=context?.schedule?.in_hours===false;
 return <div className="mx-auto max-w-6xl space-y-3 px-3 py-3 sm:px-5">
  {context?<ShiftNotice context={context} showOpen={false}/>:null}
  <header><h1 className="text-xl font-semibold">Caja y turnos</h1><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Mañana 10:00–14:00, con tolerancia hasta las 15:00 · Tarde 14:00–21:30 · Hora de Bolivia.</p></header>
  {error?<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}<button type="button" onClick={()=>void refresh()} className="ml-2 min-h-11 font-semibold underline">Reintentar</button></p>:null}
  {notice?<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>:null}
  {refreshing?<p className="text-xs text-[var(--muted)]">Actualizando caja…</p>:null}
  <DailyCashSummary refreshToken={generation}/>
  {context?<section aria-label="Turno actual" className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-3">
   {!shift?<><h2 className="font-semibold">{context.day_closed?"Día cerrado":"Sin turno abierto"}</h2><p className="text-sm text-[var(--muted)]">{context.day_closed?"El saldo final quedó guardado en el historial. La siguiente jornada comienza con saldo inicial Bs 0.":"Cada día comienza con saldo inicial Bs 0. Confirma la apertura antes de registrar pedidos o cobros."}</p>{!context.day_closed?<button type="button" onClick={()=>open("open")} disabled={busy||refreshing||outsideHours} className={primary}>Abrir caja</button>:null}</>:shift.status==="open"?<>
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">{shiftLabel(shift)} · {shift.cashier_name}</h2><p className="text-xs text-orange-800">{shiftHours(shift)}</p><p className="mt-0.5 text-xs text-[var(--muted)]">Abierta: {formatOrderDate(shift.opened_at)} · Inicial: {cashMoney(shift.opening_cash)}</p></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${expired?"bg-orange-50 text-orange-900":"bg-emerald-50 text-emerald-800"}`}>{expired?"Pendiente de cierre":"Turno abierto"}</span></div>
    <dl className="grid grid-cols-3 gap-2 rounded-xl bg-orange-50 p-3 text-xs"><div><dt>Efectivo del turno</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{cashMoney(context.summary.cash)}</dd></div><div><dt>QR del turno</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{cashMoney(context.summary.qr)}</dd></div><div><dt>Total vendido</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-orange-900">{cashMoney(context.summary.cash+context.summary.qr+context.summary.other)}</dd></div></dl>
    <div className="flex flex-wrap justify-between gap-2 border-t border-[var(--border)] pt-2 text-xs"><span>Saldo inicial del turno: <strong>{cashMoney(shift.opening_cash)}</strong></span><span>Efectivo esperado en caja: <strong>{cashMoney(context.summary.expected_cash)}</strong></span></div>
    <p className="text-xs text-[var(--muted)]">El saldo se comparte entre turnos del mismo día. Al cerrar el último turno se termina la jornada; el día siguiente empieza con saldo Bs 0.</p>
    {context.summary.other!==0?<p className="text-xs">Otros pagos: {cashMoney(context.summary.other)}</p>:null}
    {shift.cashier_id===actorId||role==="admin"?<button type="button" onClick={()=>open("close")} disabled={busy||refreshing} className={primary}>Cerrar y entregar caja</button>:<p className="text-xs text-[var(--muted)]">Puedes cobrar en esta caja. El responsable del turno registra su cierre.</p>}
    <details><summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-orange-800">Movimientos del turno ({context.summary.receipts})</summary><ReceiptList receipts={context.receipts}/></details>
   </>:<>
    <h2 className="font-semibold">Cierre anterior, pendiente de recepción</h2><p className="text-sm">{shift.cashier_name} dejó <strong>{cashMoney(shift.cash_left??0)}</strong>{shift.closed_at?" · "+formatOrderDate(shift.closed_at):""}.</p>
    <dl className="grid grid-cols-3 gap-2 text-xs"><div><dt>Efectivo vendido</dt><dd className="mt-1 font-semibold">{cashMoney(shift.cash_net)}</dd></div><div><dt>QR vendido</dt><dd className="mt-1 font-semibold">{cashMoney(shift.qr_net)}</dd></div><div><dt>Total del cierre</dt><dd className="mt-1 font-semibold">{cashMoney(shift.cash_net+shift.qr_net+shift.other_net)}</dd></div></dl>
    {shift.difference!==0?<p className="text-xs text-red-800">El cierre tiene una diferencia de {cashMoney(shift.difference??0)}.</p>:null}
    <p className="text-xs text-[var(--muted)]">Cuenta el efectivo antes de confirmar. Será el inicial del siguiente turno de hoy. No se recibe saldo de un día anterior.</p><button type="button" onClick={()=>open("receive")} disabled={busy||refreshing||outsideHours} className={primary}>Recibir caja e iniciar turno</button>
   </>}
  </section>:null}
  <CashHistoryPanel initial={history} employeeId={role==="admin"?null:actorId} refreshToken={generation} heading={role==="admin"?"Cierres del equipo":"Mis cierres de caja"}/>
  <Modal open={mode!==null} title={mode==="close"?"Cerrar y entregar caja":mode==="receive"?"Recibir caja":"Abrir caja"} busy={busy} onClose={()=>{if(!busy)setMode(null);}}>
   <form onSubmit={submit} className="space-y-3">
    {mode==="close"?<><dl className="grid grid-cols-3 gap-2 rounded-xl bg-orange-50 p-3 text-xs"><div><dt>Ventas efectivo</dt><dd className="mt-1 font-semibold">{cashMoney(cut?.summary.cash??0)}</dd></div><div><dt>Ventas QR</dt><dd className="mt-1 font-semibold">{cashMoney(cut?.summary.qr??0)}</dd></div><div><dt>Total del turno</dt><dd className="mt-1 font-semibold">{cashMoney((cut?.summary.cash??0)+(cut?.summary.qr??0)+(cut?.summary.other??0))}</dd></div></dl><p className="text-sm">Efectivo inicial: {cashMoney(cut?.shift?.opening_cash??0)} · Efectivo esperado: <strong>{cashMoney(expected)}</strong></p><p className="text-xs text-[var(--muted)]">Cuenta todo el efectivo antes de retirar dinero. QR se registra por separado y no forma parte del efectivo contado.</p></>:mode==="receive"?<p className="text-sm">{cut?.shift?.cashier_name} declaró que dejó <strong>{cashMoney(cut?.shift?.cash_left??0)}</strong>. Cuenta cuánto recibes del turno anterior de hoy.</p>:null}
    {mode==="close"&&closingDay?<p className="rounded-lg bg-orange-50 p-2 text-sm font-semibold">Este cierre termina el día. El saldo final se archiva y mañana se abre con Bs 0.</p>:null}
    {mode!=="close"&&context?.schedule?<p className="rounded-lg bg-orange-50 p-2 text-sm"><strong>{context.schedule.label}</strong> · {new Intl.DateTimeFormat("es-BO",{timeZone:"America/La_Paz",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(context.schedule.starts_at))}–{new Intl.DateTimeFormat("es-BO",{timeZone:"America/La_Paz",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(context.schedule.ends_at))}. {mode==="open"?"Saldo inicial obligatorio: Bs 0. No se arrastra dinero de ayer.":"Confirma el efectivo del turno anterior de hoy."}</p>:null}
    <label className="block text-sm font-medium">{mode==="close"?"Efectivo contado (Bs)":mode==="receive"?"Efectivo recibido (Bs)":"Saldo inicial del día (Bs)"}<input required readOnly={mode==="open"} inputMode="decimal" autoComplete="off" value={count} onChange={e=>setCount(e.target.value)} className={field}/></label>
    {mode==="close"?<><label className="block text-sm">Retiro de efectivo (Bs, opcional)<input inputMode="decimal" autoComplete="off" value={withdrawal} onChange={e=>setWithdrawal(e.target.value)} className={field}/></label>{counted!==null&&removed!==null&&removed<=counted?<p className="rounded-xl bg-orange-50 p-3 text-sm font-semibold">Dejas en caja: {cashMoney((counted-removed)/100)}</p>:null}</>:null}
    {mode!=="open"&&difference!==null?<p className={"text-sm font-medium "+(difference===0?"text-emerald-800":"text-red-800")}>{difference===0?"El conteo cuadra":"Diferencia: "+cashMoney(difference/100)}</p>:null}
    <label className="block text-sm">Observación{needsNote?" (obligatoria)":" (opcional)"}<textarea placeholder={mode==="close"?"Ej.: Diferencia en caja o incidente con un QR; detalla el pedido para revisión.":undefined} required={needsNote} minLength={needsNote?3:undefined} maxLength={500} value={note} onChange={e=>setNote(e.target.value)} className={field} rows={2}/></label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} className="h-5 w-5 shrink-0 accent-orange-600"/>{mode==="open"?"Confirmo iniciar el día con saldo Bs 0.":"Conté el efectivo y confirmo el importe."}</label>
    {formError?<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{formError}<button type="button" disabled={busy} onClick={()=>void updateCut()} className="ml-2 min-h-11 font-semibold underline">Actualizar corte</button></p>:null}
    <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={()=>setMode(null)} className={secondary}>Cancelar</button><button disabled={busy||!ack} className={primary}>{busy?"Registrando…":mode==="close"?"Confirmar cierre y entrega":mode==="receive"?"Confirmar recepción y abrir":"Confirmar apertura"}</button></div>
   </form>
  </Modal>
 </div>;
}

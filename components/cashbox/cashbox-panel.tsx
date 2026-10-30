"use client";
import {useRef,useState,type FormEvent} from "react";
import {createClient} from "@/lib/supabase/client";
import {normalizeCashContext,normalizeCashShift,type CashContext,type CashHistory} from "@/lib/cashbox";
import {toCents} from "@/lib/money";
import {formatOrderDate} from "@/lib/date-time";
import {Modal} from "@/components/ui/modal";
import {useHeaderRefresh} from "@/lib/use-header-refresh";
import {useCashboxUpdates} from "@/lib/use-cashbox-updates";
import {CashHistoryPanel,ReceiptList,cashMoney} from "./cash-history";
const field="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-base";
const primary="min-h-11 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const secondary="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40";
export function CashboxPanel({initial,history,actorId,role,initialError}:{initial:CashContext|null;history:CashHistory|null;actorId:string;role:string;initialError:string|null}){
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
 function open(next:"open"|"receive"|"close"){setCut(context);setMode(next);setCount("");setWithdrawal("0");setNote("");setAck(false);setFormError("");operation.current=null;}
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
   if(result.error)throw Error(result.error.code==="40001"?result.error.message:result.error.code==="42501"?"No tienes permiso para esta operación.":result.error.code==="22023"?result.error.message:"No se pudo confirmar el resultado. Reintenta la misma operación.");
   const saved=normalizeCashShift(result.data);
   setContext({...cut,enabled:true,shift:saved,receipts:saved.closing_snapshot,digest:"refresh",summary:{cash:saved.cash_net,qr:saved.qr_net,other:saved.other_net,receipts:saved.receipt_count,expected_cash:saved.opening_cash+saved.cash_net}});
   setNotice(mode==="close"?"Cierre registrado. El siguiente cajero debe contar y recibir el efectivo.":mode==="receive"?"Recepción registrada. Tu turno quedó abierto con el importe contado.":"Turno abierto. Los nuevos cobros se registrarán en esta caja.");
   setMode(null);operation.current=null;setGeneration(v=>v+1);await refresh();
  }catch(failure){setFormError(failure instanceof Error?failure.message:"No se pudo confirmar la operación.");}finally{setBusy(false);}
 }
 const shift=context?.shift;
 return <div className="mx-auto max-w-6xl space-y-3 px-3 py-3 sm:px-5">
  <header><h1 className="text-xl font-semibold">Caja y turnos</h1><p className="mt-1 text-xs leading-5 text-[var(--muted)]">Abre con el efectivo inicial. Al salir, cuenta y entrega. Quien entra cuenta lo recibido y abre su turno.</p></header>
  {error?<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}<button type="button" onClick={()=>void refresh()} className="ml-2 min-h-11 font-semibold underline">Reintentar</button></p>:null}
  {notice?<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>:null}
  {refreshing?<p className="text-xs text-[var(--muted)]">Actualizando caja…</p>:null}
  {context?<section aria-label="Turno actual" className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-3">
   {!shift?<><h2 className="font-semibold">Sin turno abierto</h2><p className="text-sm text-[var(--muted)]">Cuenta el dinero que hay en caja antes de empezar. Desde la primera apertura, los cobros requieren un turno abierto.</p><button type="button" onClick={()=>open("open")} disabled={busy||refreshing} className={primary}>Abrir caja</button></>:shift.status==="open"?<>
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold">Caja de {shift.cashier_name}</h2><p className="mt-0.5 text-xs text-[var(--muted)]">Abierta: {formatOrderDate(shift.opened_at)} · Inicial: {cashMoney(shift.opening_cash)}</p></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">Turno abierto</span></div>
    <dl className="grid grid-cols-3 gap-2 rounded-xl bg-orange-50 p-3 text-xs"><div><dt>Efectivo del turno</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{cashMoney(context.summary.cash)}</dd></div><div><dt>QR del turno</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{cashMoney(context.summary.qr)}</dd></div><div><dt>Efectivo esperado</dt><dd className="mt-1 text-sm font-semibold tabular-nums text-orange-900">{cashMoney(context.summary.expected_cash)}</dd></div></dl>
    <p className="text-xs text-[var(--muted)]">Esperado = efectivo inicial + cobros en efectivo − devoluciones. QR sirve como referencia.</p>
    {context.summary.other!==0?<p className="text-xs">Otros pagos: {cashMoney(context.summary.other)}</p>:null}
    {shift.cashier_id===actorId||role==="admin"?<button type="button" onClick={()=>open("close")} disabled={busy||refreshing} className={primary}>Cerrar y entregar caja</button>:<p className="text-xs text-[var(--muted)]">Puedes cobrar en esta caja. El responsable del turno registra su cierre.</p>}
    <details><summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-orange-800">Movimientos del turno ({context.summary.receipts})</summary><ReceiptList receipts={context.receipts}/></details>
   </>:<>
    <h2 className="font-semibold">Caja entregada, pendiente de recepción</h2><p className="text-sm">{shift.cashier_name} dejó <strong>{cashMoney(shift.cash_left??0)}</strong>{shift.closed_at?" · "+formatOrderDate(shift.closed_at):""}.</p>
    {shift.difference!==0?<p className="text-xs text-red-800">El cierre tiene una diferencia de {cashMoney(shift.difference??0)}.</p>:null}
    <p className="text-xs text-[var(--muted)]">Cuenta el efectivo antes de confirmar. La recepción quedará con tu nombre y abrirá tu turno.</p><button type="button" onClick={()=>open("receive")} disabled={busy||refreshing} className={primary}>Recibir caja e iniciar turno</button>
   </>}
  </section>:null}
  <CashHistoryPanel initial={history} employeeId={role==="admin"?null:actorId} refreshToken={generation} heading={role==="admin"?"Cierres del equipo":"Mis cierres de caja"}/>
  <Modal open={mode!==null} title={mode==="close"?"Cerrar y entregar caja":mode==="receive"?"Recibir caja":"Abrir caja"} busy={busy} onClose={()=>{if(!busy)setMode(null);}}>
   <form onSubmit={submit} className="space-y-3">
    {mode==="close"?<><p className="text-sm">Efectivo esperado: <strong>{cashMoney(expected)}</strong> · QR: {cashMoney(cut?.summary.qr??0)}</p><p className="text-xs text-[var(--muted)]">Cuenta todo el efectivo antes de retirar dinero.</p></>:mode==="receive"?<p className="text-sm">{cut?.shift?.cashier_name} declaró que dejó <strong>{cashMoney(cut?.shift?.cash_left??0)}</strong>. Cuenta cuánto recibes.</p>:null}
    <label className="block text-sm font-medium">{mode==="close"?"Efectivo contado (Bs)":mode==="receive"?"Efectivo recibido (Bs)":"Efectivo inicial para cambio (Bs)"}<input required inputMode="decimal" autoComplete="off" value={count} onChange={e=>setCount(e.target.value)} className={field}/></label>
    {mode==="close"?<><label className="block text-sm">Retiro de efectivo (Bs, opcional)<input inputMode="decimal" autoComplete="off" value={withdrawal} onChange={e=>setWithdrawal(e.target.value)} className={field}/></label>{counted!==null&&removed!==null&&removed<=counted?<p className="rounded-xl bg-orange-50 p-3 text-sm font-semibold">Dejas en caja: {cashMoney((counted-removed)/100)}</p>:null}</>:null}
    {mode!=="open"&&difference!==null?<p className={"text-sm font-medium "+(difference===0?"text-emerald-800":"text-red-800")}>{difference===0?"El conteo cuadra":"Diferencia: "+cashMoney(difference/100)}</p>:null}
    <label className="block text-sm">Observación{needsNote?" (obligatoria)":""}<textarea required={needsNote} minLength={needsNote?3:undefined} maxLength={500} value={note} onChange={e=>setNote(e.target.value)} className={field} rows={2}/></label>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} className="h-5 w-5 shrink-0 accent-orange-600"/>Conté el efectivo y confirmo el importe.</label>
    {formError?<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{formError}<button type="button" disabled={busy} onClick={()=>void updateCut()} className="ml-2 min-h-11 font-semibold underline">Actualizar corte</button></p>:null}
    <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={()=>setMode(null)} className={secondary}>Cancelar</button><button disabled={busy||!ack} className={primary}>{busy?"Registrando…":mode==="close"?"Confirmar cierre y entrega":mode==="receive"?"Confirmar recepción y abrir":"Confirmar apertura"}</button></div>
   </form>
  </Modal>
 </div>;
}

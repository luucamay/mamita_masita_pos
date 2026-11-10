"use client";
import {useState}from"react";
import {createClient}from"@/lib/supabase/client";
import {PaymentObservation} from "@/components/orders/payment-observation";
import {PaymentMethodPicker, type PaymentChoice} from "@/components/orders/payment-method-picker";
import {splitPayment} from "@/lib/money";
import {normalizeEmployeePurchase,employeePurchaseState,type EmployeePurchaseOrder,type EmployeePurchase}from"@/lib/employee-purchases";
export function PurchaseActions({order,canCollect,onSaved,onReload}:{order:EmployeePurchaseOrder;canCollect:boolean;onSaved:(purchase:EmployeePurchase)=>void;onReload:()=>void}){
 const [method,setMethod]=useState<PaymentChoice|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [observation,setObservation]=useState("");
 const [cashReceived,setCashReceived]=useState("");
 const split=method==="mixed"?splitPayment(order.total,cashReceived):null;
 const canSubmit=!!method&&(method!=="mixed"||!!split);
 async function perform(cancel=false){
  if(busy||!cancel&&!canSubmit)return;
  if(cancel&&!window.confirm("¿Cancelar esta compra pendiente? Se conservará en el historial y no se cobrará."))return;
  setBusy(true);setError("");
  try{
   const note=cancel?"":observation.trim();
   const rpc=cancel?"cancel_employee_purchase":split?"checkout_split_payment":note?"checkout_employee_purchase_with_observation":"checkout_employee_purchase";
   const {data,error}=await createClient().rpc(rpc,{p_order_id:order.id,p_expected_revision:order.revision,...(cancel?{}:split??{p_payment_method:method}),...(note?{p_observation:note}:{})});
   if(error)throw new Error(error.code==="PGRST202"?"Las compras de empleados todavía no están habilitadas.":error.message);
   onSaved(normalizeEmployeePurchase(data));
  }catch(failure){setError(failure instanceof Error?failure.message:"No se pudo confirmar el resultado. Puedes reintentar sin duplicar el pago.");}finally{setBusy(false);}
 }
 if(employeePurchaseState(order)!=="pending")return null;
 return <div className="space-y-3" onClick={event=>event.stopPropagation()}>
  {canCollect?<PaymentObservation value={observation} onChange={setObservation} disabled={busy}/>:null}
  {error?<div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}<button type="button" disabled={busy} onClick={onReload} className="ml-2 min-h-11 font-semibold underline">Actualizar compra</button></div>:null}
  {canCollect?<><p className="text-sm text-[var(--muted)]">Confirma el medio recibido y la entrega de los productos.</p><PaymentMethodPicker method={method} onMethodChange={setMethod} total={order.total} cash={cashReceived} onCashChange={setCashReceived} disabled={busy||order.buyer_active===false}/><button type="button" disabled={busy||!canSubmit||order.buyer_active===false} onClick={()=>void perform()} className="min-h-11 w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white disabled:opacity-40">{busy?"Procesando…":"Confirmar cobro y entrega"}</button>{order.buyer_active===false?<p className="text-sm text-red-700">El empleado está desactivado. Cancela esta compra.</p>:null}</>:<p className="text-sm text-[var(--muted)]">Pendiente de cobro. Acércate a Atención o Administración para pagar y recibir tus productos.</p>}
  <button type="button" disabled={busy} onClick={()=>void perform(true)} className="min-h-11 w-full rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-red-700">Cancelar compra</button>
 </div>;
}

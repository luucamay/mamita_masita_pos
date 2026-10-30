"use client";
import {useState}from"react";
import {createClient}from"@/lib/supabase/client";
import {normalizeEmployeePurchase,employeePurchaseState,type EmployeePurchaseOrder,type EmployeePurchase}from"@/lib/employee-purchases";
export function PurchaseActions({order,canCollect,onSaved,onReload}:{order:EmployeePurchaseOrder;canCollect:boolean;onSaved:(purchase:EmployeePurchase)=>void;onReload:()=>void}){
 const [method,setMethod]=useState<"cash"|"qr"|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function perform(cancel=false){
  if(busy||!cancel&&!method)return;
  if(cancel&&!window.confirm("¿Cancelar esta compra pendiente? Se conservará en el historial y no se cobrará."))return;
  setBusy(true);setError("");
  try{
   const {data,error}=await createClient().rpc(cancel?"cancel_employee_purchase":"checkout_employee_purchase",{p_order_id:order.id,p_expected_revision:order.revision,...(cancel?{}:{p_payment_method:method})});
   if(error)throw new Error(error.code==="PGRST202"?"Las compras de empleados todavía no están habilitadas.":error.message);
   onSaved(normalizeEmployeePurchase(data));
  }catch(failure){setError(failure instanceof Error?failure.message:"No se pudo confirmar el resultado. Puedes reintentar sin duplicar el pago.");}finally{setBusy(false);}
 }
 if(employeePurchaseState(order)!=="pending")return null;
 return <div className="space-y-3" onClick={event=>event.stopPropagation()}>
  {error?<div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}<button type="button" disabled={busy} onClick={onReload} className="ml-2 min-h-11 font-semibold underline">Actualizar compra</button></div>:null}
  {canCollect?<><p className="text-sm text-[var(--muted)]">Confirma el medio recibido y la entrega de los productos.</p><div className="flex gap-2">{(["cash","qr"]as const).map(value=><button type="button" key={value} disabled={busy||order.buyer_active===false} aria-pressed={method===value} onClick={()=>setMethod(value)} className={`min-h-11 flex-1 rounded-xl border px-4 py-2 font-semibold ${method===value?"border-orange-500 bg-orange-50 text-orange-900":"border-[var(--border)] bg-white"}`}>{value==="cash"?"Efectivo":"QR"}</button>)}</div><button type="button" disabled={busy||!method||order.buyer_active===false} onClick={()=>void perform()} className="min-h-11 w-full rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white disabled:opacity-40">{busy?"Procesando…":"Confirmar cobro y entrega"}</button>{order.buyer_active===false?<p className="text-sm text-red-700">El empleado está desactivado. Cancela esta compra.</p>:null}</>:<p className="text-sm text-[var(--muted)]">Pendiente de cobro. Acércate a Atención o Administración para pagar y recibir tus productos.</p>}
  <button type="button" disabled={busy} onClick={()=>void perform(true)} className="min-h-11 w-full rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-semibold text-red-700">Cancelar compra</button>
 </div>;
}

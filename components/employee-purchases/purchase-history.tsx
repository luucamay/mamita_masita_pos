"use client";
import {useEffect,useState}from"react";
import {createClient}from"@/lib/supabase/client";
import {normalizePurchaseHistory,employeePurchaseState,purchaseReference,type PurchaseHistory,type EmployeePurchase}from"@/lib/employee-purchases";
import {formatOrderDate}from"@/lib/date-time";
import {DiscountBadge}from"@/components/orders/discount-badge";
import {PaymentBadge}from"@/components/orders/payment-badge";
import {PurchaseActions}from"./purchase-actions";
const money=(n:number|string)=>new Intl.NumberFormat("es-BO",{style:"currency",currency:"BOB"}).format(Number(n));
export function PurchaseHistoryPanel({initial,initialError=null,team=false,onPurchaseSaved}:{initial:PurchaseHistory;initialError?:string|null;team?:boolean;onPurchaseSaved?:(purchase:EmployeePurchase)=>void}){
 const [history,setHistory]=useState(initial),[error,setError]=useState(initialError??""),[busy,setBusy]=useState(false),[filter,setFilter]=useState(team?"pending":"all");
 useEffect(()=>{setHistory(initial);setError(initialError??"");},[initial,initialError]);
 async function load(more=false,state=filter){setBusy(true);setError("");try{
  const last=more?history.purchases.at(-1)?.order:null;
  const {data,error}=await createClient().rpc("list_employee_purchases",{p_scope:team?"all":"mine",p_state:state,...(last?{p_before_created_at:last.created_at,p_before_id:last.id}:{})});
  if(error)throw new Error(error.message);const next=normalizePurchaseHistory(data);setHistory(more?{...next,purchases:[...history.purchases,...next.purchases.filter(p=>!history.purchases.some(old=>old.order.id===p.order.id))]}:next);
 }catch(failure){setError(failure instanceof Error?failure.message:"No se pudo cargar el historial.");}finally{setBusy(false);}}
 function saved(purchase:EmployeePurchase){setHistory(current=>({...current,purchases:current.purchases.map(p=>p.order.id===purchase.order.id?purchase:p).filter(p=>!team||filter==="all"||employeePurchaseState(p.order)===filter)}));onPurchaseSaved?.(purchase);}
 return <section aria-label={team?"Compras del equipo":"Mi historial de compras"} className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{team?"Compras del equipo":"Mis compras"}</h2><button type="button" disabled={busy} onClick={()=>void load()} className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold">{busy?"Actualizando…":"Actualizar compras"}</button></div>
  {team?<label className="block text-sm">Mostrar<select value={filter} disabled={busy} onChange={event=>{setFilter(event.target.value);void load(false,event.target.value);}} className="ml-2 min-h-11 rounded-xl border border-[var(--border)] bg-white px-3">{[["pending","Pendientes de cobro"],["paid","Cobradas"],["cancelled","Canceladas"],["all","Todas"]].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>:null}
  {error?<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>:null}
  {!history.purchases.length&&!error?<p className="py-8 text-sm text-[var(--muted)]">No hay compras para mostrar.</p>:null}
  <div className="space-y-4">{history.purchases.map(purchase=>{const order=purchase.order;const state=employeePurchaseState(order);return <article key={order.id} aria-label={`Compra ${purchaseReference(order.order_number)}`} className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5">
   <header className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{purchaseReference(order.order_number)}</h3>{team?<p className="mt-1 font-medium">{order.buyer_name||order.customer_name||"Empleado"}</p>:null}<p className="mt-1 text-sm text-[var(--muted)]">{formatOrderDate(order.created_at)}</p></div><div className="flex flex-wrap items-center gap-2"><DiscountBadge bps={2000}/><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${state==="pending"?"bg-orange-50 text-orange-900":state==="paid"?"bg-emerald-50 text-emerald-900":"bg-stone-100 text-stone-700"}`}>{state==="pending"?"Pendiente de cobro":state==="paid"?"Cobrada":"Cancelada"}</span>{state==="paid"?<PaymentBadge order={order}/>:null}</div></header>
   <ul className="space-y-2 text-sm">{purchase.items.filter(item=>item.status!=="voided").map(item=><li key={item.id} className="flex justify-between gap-3"><span>{item.quantity} × {item.item_name}</span><span className="shrink-0">{money(item.net_total??item.line_total)}</span></li>)}</ul>
   <dl className="space-y-2 border-t border-[var(--border)] pt-3 text-sm"><div className="flex justify-between"><dt>Subtotal</dt><dd>{money(order.subtotal??order.total)}</dd></div><div className="flex justify-between text-orange-800"><dt>Descuento de empleado (20 %)</dt><dd>−{money(order.discount_amount??0)}</dd></div><div className="flex justify-between text-base font-semibold"><dt>{state==="cancelled"?"Importe cancelado":"Total"}</dt><dd>{money(order.total)}</dd></div></dl>
   <PurchaseActions order={order} canCollect={team} onSaved={saved} onReload={()=>void load()}/>
  </article>;})}</div>
  {history.has_more?<button type="button" disabled={busy} onClick={()=>void load(true)} className="min-h-11 w-full rounded-xl border border-[var(--border)] px-4 font-semibold">Cargar más compras</button>:null}
 </section>;
}

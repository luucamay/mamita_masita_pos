"use client";
import {useEffect,useMemo,useRef,useState}from"react";
import {useRouter}from"next/navigation";
import type{Category,MenuItem}from"@/lib/types";
import {priceOrder}from"@/lib/money";
import {createClient}from"@/lib/supabase/client";
import {normalizeEmployeePurchase,employeePurchaseState,type EmployeePurchase}from"@/lib/employee-purchases";
import {DiscountBadge}from"@/components/orders/discount-badge";
type Line={id:string;name:string;price:number;quantity:number};
const money=(value:number)=>new Intl.NumberFormat("es-BO",{style:"currency",currency:"BOB"}).format(value);
export function EmployeePurchaseForm({items,categories,buyerName,loadError=null,onCreated}:{items:MenuItem[];categories:Category[];buyerName:string;loadError?:string|null;onCreated?:(purchase:EmployeePurchase)=>void}){
 const router=useRouter();const [lines,setLines]=useState<Line[]>([]),[query,setQuery]=useState(""),[category,setCategory]=useState("all"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const request=useRef<{payload:string;id:string}|null>(null);
 const cartRef=useRef<HTMLDivElement>(null);const[cartVisible,setCartVisible]=useState(false);
 useEffect(()=>{const element=cartRef.current;if(!element)return;const observer=new IntersectionObserver(([entry])=>setCartVisible(entry.isIntersecting));observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{setLines(current=>current.map(line=>{const item=items.find(item=>item.id===line.id);return item?{...line,price:item.price}:line;}));},[items]);
 const available=useMemo(()=>items.filter(item=>categories.some(category=>category.id===item.category_id)),[items,categories]);
 const matches=available.filter(item=>(category==="all"||item.category_id===category)&&item.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().includes(query.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim()));
 const priced=useMemo(()=>priceOrder(lines.map(line=>({id:line.id,unitPrice:line.price,quantity:line.quantity})),2000),[lines]);
 const invalid=lines.some(line=>!available.some(item=>item.id===line.id));
 function add(item:MenuItem){setNotice("");setLines(current=>{const found=current.find(line=>line.id===item.id);return found?current.map(line=>line.id===item.id?{...line,quantity:Math.min(999,line.quantity+1)}:line):[...current,{id:item.id,name:item.name,price:item.price,quantity:1}];});}
 async function submit(){
  if(busy||!lines.length||invalid||loadError)return;
  const payload=JSON.stringify(lines.map(line=>({menu_item_id:line.id,quantity:line.quantity,expected_unit_price:line.price})));
  if(request.current?.payload!==payload)request.current={payload,id:crypto.randomUUID()};
  setBusy(true);setError("");setNotice("");
  try{
   const result=await createClient().rpc("create_employee_purchase",{p_items:JSON.parse(payload),p_request_id:request.current.id});
   if(result.error){if(result.error.code==="40001")router.refresh();throw new Error(result.error.code==="PGRST202"?"Las compras personales todavía no están habilitadas.":result.error.message);}
   const purchase=normalizeEmployeePurchase(result.data);onCreated?.(purchase);setLines([]);request.current=null;setNotice(employeePurchaseState(purchase.order)==="paid"?"Esta compra ya está cobrada. El reintento no generó otra compra ni otro pago.":employeePurchaseState(purchase.order)==="cancelled"?"Esta compra ya fue cancelada. No se creó otra compra.":"Compra enviada a Atención/Administración. Aún no está cobrada: acércate para pagar y recibir tus productos.");router.refresh();
  }catch(failure){setError(failure instanceof Error?failure.message:"No se pudo confirmar la compra. Reintenta con el mismo pedido sin duplicarlo.");}finally{setBusy(false);}
 }
 return <section aria-label="Compra personal" className="space-y-3">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold">Mi compra</h1><p className="mt-2 text-sm text-[var(--muted)]">Para {buyerName}. Descuento fijo del 20 %, sin sumar la promoción del día.</p></div><DiscountBadge bps={2000}/></div>
  {loadError||error?<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{loadError||error}</p>:null}{notice?<p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">{notice}</p>:null}
  <div className="grid items-start gap-3 lg:grid-cols-[1fr_360px]">
   <div className="space-y-3"><div className="flex flex-wrap gap-3"><label className="min-w-0 flex-1 text-sm">Buscar producto<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Nombre del producto" className="mt-1 min-h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3"/></label><label className="text-sm">Categoría<select value={category} onChange={event=>setCategory(event.target.value)} className="mt-1 block min-h-11 max-w-full rounded-xl border border-[var(--border)] bg-white px-3"><option value="all">Todas</option>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div>
    {!matches.length?<p className="py-8 text-sm text-[var(--muted)]">No se encontraron productos disponibles.</p>:<ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-white px-4">{matches.map(item=><li key={item.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><h2 className="break-words font-medium">{item.name}</h2><p className="mt-1 text-sm text-[var(--muted)]">{money(item.price)} c/u · <span className="text-orange-800">{money(priceOrder([{id:item.id,unitPrice:item.price,quantity:1}],2000).netCents/100)} con descuento</span></p></div><button type="button" aria-label={`Agregar ${item.name}`} disabled={busy} onClick={()=>add(item)} className="min-h-11 shrink-0 rounded-xl bg-orange-100 px-4 font-semibold text-orange-900 disabled:opacity-40">Agregar</button></li>)}</ul>}
   </div>
   <div ref={cartRef} id="resumen-compra" className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-3 lg:sticky lg:top-20"><h2 className="text-xl font-semibold">Resumen de mi compra</h2>
    {!lines.length?<p className="py-5 text-sm text-[var(--muted)]">Agrega productos para comenzar.</p>:<ul className="divide-y divide-[var(--border)]">{lines.map(line=><li key={line.id} className="space-y-2 py-3"><div className="flex justify-between gap-3"><span className="break-words font-medium">{line.name}</span><span className="shrink-0 font-semibold">{money((priced.lines.find(p=>p.id===line.id)?.netCents??0)/100)}</span></div><div className="flex items-center gap-3"><button type="button" aria-label={`Quitar una unidad de ${line.name}`} disabled={busy} onClick={()=>setLines(current=>current.map(p=>p.id===line.id?{...p,quantity:p.quantity-1}:p).filter(p=>p.quantity>0))} className="h-11 w-11 rounded-xl border border-[var(--border)] text-xl">−</button><span>{line.quantity}</span><button type="button" aria-label={`Agregar otra unidad de ${line.name}`} disabled={busy||line.quantity>=999} onClick={()=>setLines(current=>current.map(p=>p.id===line.id?{...p,quantity:p.quantity+1}:p))} className="h-11 w-11 rounded-xl bg-orange-50 text-xl text-orange-900">+</button></div></li>)}</ul>}
    <dl className="space-y-2 border-t border-[var(--border)] pt-3 text-sm"><div className="flex justify-between"><dt>Subtotal</dt><dd>{money(priced.grossCents/100)}</dd></div><div className="flex justify-between text-orange-800"><dt>Descuento de empleado (20 %)</dt><dd>−{money(priced.discountCents/100)}</dd></div><div className="flex justify-between text-lg font-semibold"><dt>Total</dt><dd>{money(priced.netCents/100)}</dd></div></dl>
    {invalid?<p role="alert" className="text-sm text-red-700">Un producto ya no está disponible. Quítalo de la compra.</p>:null}
    <p className="text-sm leading-6 text-[var(--muted)]">Atención o Administración confirma Efectivo/QR al cobrar y entregar.</p>
    <button type="button" onClick={()=>void submit()} disabled={busy||!lines.length||invalid||!!loadError} className="min-h-11 w-full rounded-xl bg-orange-500 px-3 py-2 font-semibold text-white disabled:opacity-40">{busy?"Enviando…":"Enviar compra a cobro"}</button>
   </div>
  </div>
  {lines.length&&!cartVisible?<a href="#resumen-compra" className="fixed right-4 bottom-4 z-20 rounded-xl bg-orange-600 px-5 py-3 font-semibold text-white shadow-md lg:hidden">Revisar compra · {money(priced.netCents/100)}</a>:null}
 </section>;
}

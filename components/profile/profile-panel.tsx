import Link from "next/link";
import type{UserRole}from"@/lib/permissions";
import{homeForRole}from"@/lib/permissions";
import type{PurchaseHistory}from"@/lib/employee-purchases";
import{PurchaseHistoryPanel}from"@/components/employee-purchases/purchase-history";
import{DiscountBadge}from"@/components/orders/discount-badge";
const roles:Record<UserRole,string>={admin:"Administración",staff:"Atención",cook:"Cocina",barista:"Barista"};
export function ProfilePanel({name,email,role,history,historyError=null}:{name:string;email:string;role:UserRole;history:PurchaseHistory;historyError?:string|null}){
 const initials=(name||email||"Mi cuenta").trim().split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();
 return <div className="mx-auto max-w-5xl space-y-8 px-5 py-7 md:px-8">
  <header><h1 className="text-3xl font-semibold tracking-tight">Mi perfil</h1><p className="mt-2 text-sm text-[var(--muted)]">Los datos de tu cuenta y tus compras personales en la cafetería.</p></header>
  <div className="grid items-start gap-6 md:grid-cols-[1fr_320px]">
   <section aria-label="Datos de mi cuenta" className="rounded-2xl border border-[var(--border)] bg-white p-5 sm:p-6"><div className="mb-6 flex items-center gap-4"><span aria-hidden className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xl font-semibold text-orange-900">{initials}</span><div className="min-w-0"><h2 className="break-words text-xl font-semibold">{name||"Mi cuenta"}</h2><p className="mt-1 text-sm text-[var(--muted)]">{roles[role]}</p></div><span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">Activa</span></div><dl className="space-y-4 text-sm"><div><dt className="text-[var(--muted)]">Nombre</dt><dd className="mt-1 break-words font-medium">{name||"Sin nombre registrado"}</dd></div><div><dt className="text-[var(--muted)]">Correo electrónico</dt><dd className="mt-1 break-all font-medium">{email||"Sin correo registrado"}</dd></div><div><dt className="text-[var(--muted)]">Rol en la cafetería</dt><dd className="mt-1 font-medium">{roles[role]}</dd></div></dl></section>
   <section aria-label="Mi descuento de empleado" className="space-y-4 rounded-2xl border border-orange-200 bg-orange-50 p-5 sm:p-6"><DiscountBadge bps={2000}/><h2 className="text-xl font-semibold text-orange-950">Tu compra personal</h2><p className="text-sm leading-6 text-orange-900">Tienes un 20 % fijo para tus productos, sin acumular la promoción del día. Atención o Administración confirma el cobro y la entrega.</p><Link href="/perfil/compras" className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-3 text-center text-sm font-semibold text-white">Comprar con descuento de empleado</Link></section>
  </div>
  <div className="flex flex-wrap gap-4"><Link href={homeForRole(role)} className="inline-flex min-h-11 items-center font-semibold text-orange-800">Volver al trabajo</Link>{role==="admin"||role==="staff"?<Link href="/compras-empleados" className="inline-flex min-h-11 items-center font-semibold text-orange-800">Cobros de empleados</Link>:null}</div>
  <PurchaseHistoryPanel initial={history} initialError={historyError}/>
 </div>;
}

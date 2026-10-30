import Link from "next/link";
import {getEmployeeMenuData}from"@/lib/menu";
import {getEmployeePurchaseData}from"@/lib/employee-purchase-data";
import {EmployeePurchaseForm}from"@/components/employee-purchases/purchase-form";
import {PurchaseHistoryPanel}from"@/components/employee-purchases/purchase-history";
export default async function MyPurchases(){
 const [menu,data]=await Promise.all([getEmployeeMenuData(),getEmployeePurchaseData()]);
 return <div className="mx-auto max-w-7xl space-y-3 px-3 py-3 pb-24 sm:px-5"><Link href="/perfil" className="inline-flex min-h-11 items-center text-sm font-semibold text-orange-800">Volver a mi perfil</Link><EmployeePurchaseForm categories={menu.categories} items={menu.items} buyerName={data.access.profile.full_name||data.access.email||"mi cuenta"} loadError={menu.error}/><PurchaseHistoryPanel initial={data.history} initialError={data.loadError}/></div>;
}

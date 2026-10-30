import Link from "next/link";
import {getEmployeePurchaseData}from"@/lib/employee-purchase-data";
import {PurchaseHistoryPanel}from"@/components/employee-purchases/purchase-history";
export default async function TeamPurchases(){const data=await getEmployeePurchaseData(true);return <div className="mx-auto max-w-5xl space-y-3 px-3 py-3 sm:px-5"><header><h1 className="text-xl font-semibold">Cobros del equipo</h1><Link href="/pedidos" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-orange-800">Ver Pedidos</Link></header><PurchaseHistoryPanel initial={data.history} initialError={data.loadError} team/></div>;}

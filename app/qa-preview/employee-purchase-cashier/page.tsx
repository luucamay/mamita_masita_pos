import{notFound}from"next/navigation";
import{requireRoles}from"@/lib/auth";
import{PurchaseHistoryPanel}from"@/components/employee-purchases/purchase-history";
import{qaEmployeePurchase}from"@/lib/qa-purchase-fixture";
export default async function QaCashier(){if(process.env.MAMITA_QA_BUILD!=="true")notFound();await requireRoles(["admin","staff"]);return<div className="mx-auto max-w-4xl p-5"><PurchaseHistoryPanel team initial={{purchases:[qaEmployeePurchase()],has_more:false}}/></div>;}

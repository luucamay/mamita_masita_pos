import{notFound}from"next/navigation";
import{requireRoles}from"@/lib/auth";
import{EmployeePurchaseForm}from"@/components/employee-purchases/purchase-form";
import{qaPurchaseMenu,qaPurchaseCategories}from"@/lib/qa-purchase-fixture";
export default async function QaPurchase(){if(process.env.MAMITA_QA_BUILD!=="true")notFound();await requireRoles(["admin","staff","cook","barista"]);return<div className="mx-auto max-w-6xl p-5 pb-24"><EmployeePurchaseForm items={qaPurchaseMenu} categories={qaPurchaseCategories} buyerName="Empleado QA"/></div>;}

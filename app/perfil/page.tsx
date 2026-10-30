import Link from "next/link";
import {getEmployeePurchaseData} from "@/lib/employee-purchase-data";
import {ProfilePanel} from "@/components/profile/profile-panel";
import {CashHistoryPanel} from "@/components/cashbox/cash-history";
export default async function MyProfile(){
 const data=await getEmployeePurchaseData();
 return <><ProfilePanel name={data.access.profile.full_name??""} email={data.access.email} role={data.access.profile.role} history={data.history} historyError={data.loadError}/>{data.access.profile.role==="admin"||data.access.profile.role==="staff"?<div className="mx-auto max-w-5xl space-y-2 px-3 pb-4 sm:px-5"><Link href="/caja" className="inline-flex min-h-11 items-center text-sm font-semibold text-orange-800">Caja y cambios de turno</Link><CashHistoryPanel employeeId={data.access.userId} filters={false} heading="Mis cierres de hoy"/></div>:null}</>;
}

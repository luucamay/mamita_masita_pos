import {notFound} from "next/navigation";
import {requireRoles} from "@/lib/auth";
import {qaCashContext,qaCashHistory,qaScheduledCashContext} from "@/lib/qa-cashbox-fixture";
import {CashboxPanel} from "@/components/cashbox/cashbox-panel";
export default async function QaCashbox({searchParams}:{searchParams:Promise<{state?:string;schedule?:string}>}){
 if(process.env.MAMITA_QA_BUILD!=="true")notFound();
 const access=await requireRoles(["admin","staff"]),query=await searchParams;
 return <CashboxPanel initial={query.schedule?qaScheduledCashContext(query.schedule,access.userId):qaCashContext(query.state??"empty",access.userId)} history={qaCashHistory()} initialError={null} actorId={access.userId} role={access.profile.role}/>;
}

import {requireRoles} from "@/lib/auth";
import {getCashboxContext,getCashboxHistory} from "@/lib/cashbox-data";
import {CashboxPanel} from "@/components/cashbox/cashbox-panel";
export default async function CashboxPage(){
 const access=await requireRoles(["admin","staff"]);
 const [context,history]=await Promise.all([getCashboxContext(),getCashboxHistory(access.profile.role==="admin"?null:access.userId)]);
 return <CashboxPanel initial={context.context} initialError={context.error} history={history.history} actorId={access.userId} role={access.profile.role}/>;
}

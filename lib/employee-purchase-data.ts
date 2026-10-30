import "server-only";
import { requireRoles } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizePurchaseHistory, type PurchaseHistory } from "@/lib/employee-purchases";
export async function getEmployeePurchaseData(team=false) {
  const access=await requireRoles(team?["admin","staff"]:["admin","staff","cook","barista"]);
  const {data,error}=await(await createClient()).rpc("list_employee_purchases",{p_scope:team?"all":"mine",p_state:team?"pending":"all"});
  let history:PurchaseHistory={purchases:[],has_more:false};
  let loadError=error?"No se pudo cargar el historial de compras. Intenta actualizar.":null;
  if(!error)try{history=normalizePurchaseHistory(data);}catch{loadError="No se pudo verificar el historial de compras.";}
  return {access,history,loadError};
}

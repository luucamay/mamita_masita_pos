import "server-only";
import {createClient} from "@/lib/supabase/server";
import {normalizeCashContext,normalizeCashHistory} from "./cashbox";
export async function getCashboxContext(){
 try{const client=await createClient();const result=await client.rpc("get_cashbox_context");if(result.error)throw Error();return {context:normalizeCashContext(result.data),error:null};}
 catch{return {context:null,error:"No se pudo cargar la caja. Intenta actualizar."};}
}
export async function getCashboxHistory(employee:string|null=null){
 try{const client=await createClient();const result=await client.rpc("list_cashbox_shifts",{p_employee:employee});if(result.error)throw Error();return {history:normalizeCashHistory(result.data),error:null};}
 catch{return {history:null,error:"No se pudieron cargar los cierres de caja."};}
}

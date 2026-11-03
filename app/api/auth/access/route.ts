import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {sessionAccess} from "@/lib/session-access";
export async function GET(){
 const headers={"Cache-Control":"private, no-store"};
 try {
  const client=await createClient();
  const result=await sessionAccess({
   user:()=>client.auth.getUser(),
   profile:async id=>await client.from("profiles").select("role,active").eq("id",id).maybeSingle(),
  });
  return NextResponse.json(result.status===200?{userId:result.userId,role:result.role}:{error:result.status===401?"Acceso no disponible":"No se pudo verificar el acceso"},{status:result.status,headers});
 } catch {return NextResponse.json({error:"No se pudo verificar el acceso"},{status:503,headers});}
}

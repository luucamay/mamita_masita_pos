import { NextResponse } from "next/server";
import { getActiveAccess } from "@/lib/auth";
import { homeForRole } from "@/lib/permissions";
import { getKitchenQueue } from "@/lib/kitchen";
import { getCafeQueue } from "@/lib/cafe";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:Request){
  const started=performance.now();
  const access=await getActiveAccess();
  if(!access)return NextResponse.json({error:"Sesión no disponible",redirectTo:"/login?reason=inactive"},{status:401,headers});
  const params=new URL(request.url).searchParams,queue=params.get("queue");
  if(!["kitchen","cafe"].includes(queue??"")||params.getAll("queue").length!==1)return NextResponse.json({error:"Cola inválida"},{status:400,headers});
  if(!["admin","staff",queue==="kitchen"?"cook":"barista"].includes(access.profile.role))return NextResponse.json({error:"Acceso no autorizado",redirectTo:homeForRole(access.profile.role)},{status:403,headers});
  const authorized=performance.now();
  const result=queue==="kitchen"?await getKitchenQueue(access):await getCafeQueue(access);
  const fetched=performance.now(),response=NextResponse.json(result,{status:result.error?503:200,headers});
  response.headers.set("Server-Timing",`access;dur=${(authorized-started).toFixed(1)}, data;dur=${(fetched-authorized).toFixed(1)}, encode;dur=${(performance.now()-fetched).toFixed(1)}`);
  return response;
}

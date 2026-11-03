"use client";
import {useEffect,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {isActiveProfile,type UserRole} from "@/lib/permissions";
import {ACCESS_CHANNEL,ACCESS_EVENT} from "@/lib/access-notification";

export function useAccessGuard(protectedPage:boolean){
 const [role,setRole]=useState<UserRole|null>(null),[ending,setEnding]=useState(false);
 useEffect(()=>{
  if(!protectedPage){setRole(null);setEnding(false);return;}
  const client=createClient();let alive=true,exiting=false,running=false,queued=false;
  let timeout:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined;
  async function endSession(){
   if(!alive||exiting)return;exiting=true;setEnding(true);setRole(null);
   // Hide private content immediately; revoke this client's refresh session and
   // let Auth notify other tabs. Backend policies already deny inactive profiles.
   const redirect=setTimeout(()=>window.location.replace("/login?reason=inactive"),1500);
   try{await client.auth.signOut({scope:"local"});}finally{clearTimeout(redirect);window.location.replace("/login?reason=inactive");}
  }
  async function verify(){
   if(!alive||exiting||!navigator.onLine||document.visibilityState!=="visible")return;
   if(running){queued=true;return;}running=true;
   controller=new AbortController();const abort=setTimeout(()=>controller?.abort(),8000);
   try{
    const response=await fetch("/api/auth/access",{cache:"no-store",signal:controller.signal});
    if(!alive||exiting)return;
    if(response.status===401){await endSession();return;}
    if(!response.ok)return; // Network/backend failures do not mean deactivation.
    const access=await response.json();
    if(alive&&!exiting&&isActiveProfile({role:access.role,active:true}))setRole(access.role);
   }catch{/* Retain the current view on temporary network failure. */}
   finally{clearTimeout(abort);running=false;if(queued&&alive&&!exiting){queued=false;schedule();}}
  }
  function schedule(){if(!alive||exiting||timeout)return;timeout=setTimeout(()=>{timeout=undefined;void verify();},150);}
  const channel=client.channel(ACCESS_CHANNEL).on("broadcast",{event:ACCESS_EVENT},schedule).subscribe(state=>{if(state==="SUBSCRIBED")schedule();});
  const {data:listener}=client.auth.onAuthStateChange(event=>{
   if(event==="INITIAL_SESSION")return;
   if(event==="SIGNED_OUT"&&!exiting){exiting=true;setEnding(true);setRole(null);window.location.replace("/login");}
   else schedule(); // Avoid Auth calls within the SDK callback/lock.
  });
  void verify();const interval=setInterval(()=>void verify(),15000);
  window.addEventListener("focus",schedule);window.addEventListener("online",schedule);document.addEventListener("visibilitychange",schedule);
  return()=>{alive=false;controller?.abort();clearInterval(interval);if(timeout)clearTimeout(timeout);listener.subscription.unsubscribe();window.removeEventListener("focus",schedule);window.removeEventListener("online",schedule);document.removeEventListener("visibilitychange",schedule);void client.removeChannel(channel);};
 },[protectedPage]);
 return {role,ending};
}

"use client";
import {useEffect,useRef,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {isActiveProfile,type UserRole} from "@/lib/permissions";
import {ACCESS_CHANNEL,ACCESS_EVENT} from "@/lib/access-notification";

export function useAccessGuard(protectedPage:boolean,initialRole:UserRole|null=null){
 const [role,setRole]=useState<UserRole|null>(()=>protectedPage?initialRole:null),[ending,setEnding]=useState(false);
 const [unavailable,setUnavailable]=useState(false),[checking,setChecking]=useState(protectedPage);
 const recheck=useRef<()=>void>(()=>{});
 useEffect(()=>{
  if(!protectedPage){setRole(null);setEnding(false);setUnavailable(false);setChecking(false);return;}
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
   if(!alive||exiting||document.visibilityState!=="visible")return;
   if(!navigator.onLine){setUnavailable(true);setChecking(false);return;}
   if(running){queued=true;return;}running=true;setChecking(true);
   controller=new AbortController();const abort=setTimeout(()=>controller?.abort(),8000);
   try{
    const response=await fetch("/api/auth/access",{cache:"no-store",signal:controller.signal});
    if(!alive||exiting)return;
    if(response.status===401){await endSession();return;}
    if(!response.ok){setUnavailable(true);return;} // Keep the server-verified role.
    const access=await response.json();
    if(alive&&!exiting){
     if(isActiveProfile({role:access.role,active:true})){setRole(access.role);setUnavailable(false);}
     else setUnavailable(true);
    }
   }catch{if(alive&&!exiting)setUnavailable(true);}
   finally{clearTimeout(abort);running=false;if(alive)setChecking(false);if(queued&&alive&&!exiting){queued=false;schedule();}}
  }
  function schedule(){if(!alive||exiting||timeout)return;timeout=setTimeout(()=>{timeout=undefined;void verify();},150);}
  recheck.current=()=>void verify();
  const channel=client.channel(ACCESS_CHANNEL).on("broadcast",{event:ACCESS_EVENT},schedule).subscribe(state=>{if(state==="SUBSCRIBED")schedule();});
  const {data:listener}=client.auth.onAuthStateChange(event=>{
   if(event==="INITIAL_SESSION")return;
   if(event==="SIGNED_OUT"&&!exiting){exiting=true;setEnding(true);setRole(null);window.location.replace("/login");}
   else schedule(); // Avoid Auth calls within the SDK callback/lock.
  });
  void verify();const interval=setInterval(()=>void verify(),15000);
  window.addEventListener("focus",schedule);window.addEventListener("online",schedule);document.addEventListener("visibilitychange",schedule);
  return()=>{alive=false;recheck.current=()=>{};controller?.abort();clearInterval(interval);if(timeout)clearTimeout(timeout);listener.subscription.unsubscribe();window.removeEventListener("focus",schedule);window.removeEventListener("online",schedule);document.removeEventListener("visibilitychange",schedule);void client.removeChannel(channel);};
 },[protectedPage]);
 return {role,ending,unavailable,checking,retry:()=>recheck.current()};
}

import test from "node:test";
import assert from "node:assert/strict";
import {sessionAccess} from "../lib/session-access.ts";
import {notifyAccessChange,ACCESS_CHANNEL,ACCESS_EVENT} from "../lib/access-notification.ts";
import {appLoginLink,appWhatsAppLink} from "../lib/app-sharing.ts";

test("access checks distinguish denial from transient Auth/database outages",async()=>{
 const user=async()=>({data:{user:{id:"employee"}},error:null});
 for(const profile of [null,{role:"staff",active:false},{role:"owner",active:true}])assert.equal((await sessionAccess({user,profile:async()=>({data:profile,error:null})})).status,401);
 assert.deepEqual(await sessionAccess({user,profile:async()=>({data:{role:"staff",active:true},error:null})}),{status:200,userId:"employee",role:"staff"});
 assert.equal((await sessionAccess({user,profile:async()=>({data:null,error:{message:"outage"}})})).status,503);
 for(const error of [{status:503},{name:"AuthRetryableFetchError",status:0}])assert.equal((await sessionAccess({user:async()=>({data:{user:null},error}),profile:async()=>{throw Error("Must not read profile");}})).status,503);
 for(const error of [{status:401},{name:"AuthSessionMissingError"},{code:"session_not_found"}])assert.equal((await sessionAccess({user:async()=>({data:{user:null},error}),profile:async()=>{throw Error("Must not read profile");}})).status,401);
});
test("access notification sends no identity or secrets and delivery failure never undoes the deactivation",async()=>{
 let topic="",args:unknown[]=[];
 await notifyAccessChange({channel:name=>{topic=name;return {httpSend:async(...values)=>{args=values;}};}});
 assert.equal(topic,ACCESS_CHANNEL);assert.deepEqual(args,[ACCESS_EVENT,{}, {timeout:2500}]);
 await assert.doesNotReject(()=>notifyAccessChange({channel:()=>({httpSend:async()=>{throw Error("offline");}})}));
});
test("WhatsApp shares canonical login and installation instructions without session/query or credentials",()=>{
 const link=appLoginLink("mamita.example.test","https://preview.example.test/pedidos?token=secret");
 assert.equal(link,"https://mamita.example.test/login");
 assert.equal(appLoginLink(undefined,"https://app.example.test/path?token=secret"),"https://app.example.test/login");
 assert.equal(appLoginLink("javascript:alert(1)","https://app.example.test"),"https://app.example.test/login");
 assert.equal(appLoginLink("https://user:password@bad.example.test","https://app.example.test"),"https://app.example.test/login");
 const url=new URL(appWhatsAppLink(link)),message=url.searchParams.get("text")!;
 assert.equal(url.origin,"https://wa.me");assert(message.includes(link));assert(message.includes("pantalla de inicio"));assert(!message.includes("secret"));assert(!message.includes("@mamita.local"));assert(!message.includes("Contraseña:"));
});

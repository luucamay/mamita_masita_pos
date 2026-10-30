import assert from "node:assert/strict";
import { test } from "node:test";
import { readActiveAccess } from "../lib/active-access.ts";
import { parseBoardPage, normalizeOrderBoard } from "../lib/order-board.ts";
const profile={role:"staff",active:true,full_name:"QA",created_at:"2026-10-30"};
test("P14 parallel access still rejects invalid claims, Auth revocation, identity mismatch and inactive profiles",async()=>{
  const base={subject:async()=>"qa",user:async()=>({id:"qa",email:"qa@example.test"}),profile:async()=>profile};
  assert.equal((await readActiveAccess(base))?.profile.role,"staff");
  for(const override of [{subject:async()=>null},{user:async()=>null},{user:async()=>({id:"other"})},{profile:async()=>({...profile,active:false})},{profile:async()=>null}])assert.equal(await readActiveAccess({...base,...override}),null);
  // A cached JWT never supplies the role; the current profile does.
  assert.equal((await readActiveAccess({...base,profile:async()=>({...profile,role:"cook"})}))?.profile.role,"cook");
});
test("P14 Auth and profile run together only after signature-verified subject is available",async()=>{
  let release:()=>void=()=>{},profileStarted=false;
  const access=readActiveAccess({subject:async()=>"qa",user:()=>new Promise(resolve=>{release=()=>resolve({id:"qa"});}),profile:async()=>{profileStarted=true;return profile;}});
  await new Promise(resolve=>setTimeout(resolve,0));assert.equal(profileStarted,true);release();assert.equal((await access)?.userId,"qa");
});
test("P14 page filters reject ambiguous values and pagination never silently drops malformed metadata",()=>{
  assert.equal(parseBoardPage(null,true),1);assert.equal(parseBoardPage("40",true),40);
  for(const value of ["0","-1","1.5","1e2","1000001",["1","2"]])assert.throws(()=>parseBoardPage(value,true));assert.throws(()=>parseBoardPage("2",false));
  const raw={orders:[],selected:null,server_time:"2026-10-30T12:00:00Z",pagination:{page:1,size:24,total:938,pages:40}};
  assert.equal(normalizeOrderBoard(raw).pagination?.total,938);assert.throws(()=>normalizeOrderBoard({...raw,pagination:{...raw.pagination,pages:39}}));
});

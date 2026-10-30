import assert from "node:assert/strict";
import { test } from "node:test";
import { elapsedLabel, orderDurations, normalizeOrderBoard } from "../lib/order-board.ts";
import { createLiveRefresh } from "../lib/live-refresh.ts";
const order = { id:"qa",order_number:"QA",table_number:"QA",customer_name:null,status:"confirmado" as const,created_at:"2026-10-30T10:00:00Z",delivered_at:null,paid_at:null,item_count:1,total:59 };
const wait = (ms=15) => new Promise(resolve=>setTimeout(resolve,ms));
test("P13 preparation and account follow original creation and stop at different transitions",()=>{
  const now=Date.parse("2026-10-30T11:05:00Z");assert.equal(elapsedLabel(orderDurations(order,now).preparation),"01:05:00");
  const delivered={...order,status:"entregado" as const,delivered_at:"2026-10-30T10:30:00Z"};assert.equal(elapsedLabel(orderDurations(delivered,now).preparation),"30:00");assert.equal(elapsedLabel(orderDurations(delivered,now).account),"01:05:00");
  const paid={...delivered,status:"archivado" as const,paid_at:"2026-10-30T11:00:00Z"};assert.equal(elapsedLabel(orderDurations(paid,now).account),"01:00:00");
  assert.equal(orderDurations({...order,total:99},now).preparation,orderDurations(order,now).preparation);
});
test("P13 missing timestamps stay unknown, future dates clamp to zero and durations exceed a day",()=>{
  const now=Date.parse("2026-10-30T11:00:00Z");assert.equal(elapsedLabel(orderDurations({...order,status:"archivado",paid_at:"2026-10-30T11:00:00Z"},now).preparation),"Sin registro");
  assert.equal(elapsedLabel(orderDurations({...order,created_at:"2030-01-01T00:00:00Z"},now).account),"00:00");assert.equal(elapsedLabel(25*3600000+61000),"25:01:01");
  assert.equal(elapsedLabel(orderDurations({...order,created_at:"invalid"},now).account),"Sin registro");
});
test("P13 board rejects malformed clocks and duplicates and normalizes canonical item totals",()=>{
  const value={server_time:"2026-10-30T11:00:00Z",selected:null,orders:[{...order,items:[{id:"line",item_name:"Café",category_name:"QA",quantity:"2",unit_price:"20",line_total:"40",net_total:"34",status:"pending"}]}]};
  const board=normalizeOrderBoard(value);assert.equal(board.orders[0].items[0].net_total,34);assert.equal(board.orders[0].item_count,1);
  assert.throws(()=>normalizeOrderBoard({...value,server_time:"bad"}));assert.throws(()=>normalizeOrderBoard({...value,orders:[value.orders[0],value.orders[0]]}));
});
test("P13 bursts coalesce and an invalidation during fetch requests a fresh snapshot",async()=>{
  let calls=0;let finish:(value:number)=>void=()=>{};const applied:number[]=[];
  const refresh=createLiveRefresh({delay:1,load:async()=>{calls++;return calls===1?new Promise<number>(resolve=>finish=resolve):2;},apply:value=>applied.push(value),failed:()=>assert.fail("unexpected failure")});
  for(let i=0;i<20;i++)refresh.request();await wait();assert.equal(calls,1);refresh.request();finish(1);await wait();assert.equal(calls,2);assert.deepEqual(applied,[1,2]);refresh.dispose();
});
test("P13 hidden/offline refreshes pause and disposal prevents late responses",async()=>{
  let visible=false,calls=0;const applied:number[]=[];let finish:(value:number)=>void=()=>{};
  const refresh=createLiveRefresh({delay:1,canRun:()=>visible,load:async()=>{calls++;return new Promise<number>(resolve=>finish=resolve);},apply:value=>applied.push(value),failed:()=>{}});
  refresh.request();await wait();assert.equal(calls,0);visible=true;refresh.request(true);await wait();assert.equal(calls,1);refresh.dispose();finish(1);await wait();assert.deepEqual(applied,[]);
});
test("P13 failed snapshots retain previous data and retry without duplicate parallel requests",async()=>{
  let calls=0;const applied:number[]=[];let errors=0;
  const refresh=createLiveRefresh({delay:1,retry:2,load:async()=>{if(++calls===1)throw Error("offline");return 3;},apply:value=>applied.push(value),failed:()=>errors++});refresh.request();await wait(30);refresh.dispose();assert.equal(errors,1);assert.deepEqual(applied,[3]);assert.equal(calls,2);
});

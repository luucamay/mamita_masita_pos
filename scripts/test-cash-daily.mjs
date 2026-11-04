import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export function testCashDaily({query,read,as,denied,check,id,apply}){
 const fingerprint=()=>read("select md5(string_agg(to_jsonb(s)::text,'' order by id)) from public.cash_shifts s");
 const before=fingerprint();apply();
 check('Daily summary migration preserves existing cash cuts',()=>assert.equal(fingerprint(),before));
 function closed(opened,closedAt,slot,initial,receipts){
  const shift=randomUUID(),cash=receipts.filter(r=>r.method==='cash').reduce((a,r)=>a+r.amount,0),qr=receipts.filter(r=>r.method==='qr').reduce((a,r)=>a+r.amount,0),left=initial+cash;
  query(`insert into public.cash_shifts(id,cashier_id,opened_at,opening_cash,status,closed_at,closed_by,cash_net,qr_net,receipt_count,counted_cash,cash_left,difference,received_at,received_by,received_cash,receipt_difference,closing_snapshot,shift_slot,scheduled_start_at,scheduled_end_at) values('${shift}','${id.staff}','${opened}',${initial},'received','${closedAt}','${id.staff}',${cash},${qr},${receipts.length},${left},${left},0,'${closedAt}','${id.admin}',${left},0,'${JSON.stringify(receipts)}','${slot}','${opened}','${closedAt}')`);
 }
 const summary=(date,who='admin')=>JSON.parse(as(who,`select public.get_cashbox_daily_summary('${date}')`));
 const receipt=(method,amount,time)=>({method,amount,recorded_at:time});
 closed('2050-11-04T14:00:00Z','2050-11-04T18:00:00Z','morning',100,[receipt('cash',236,'2050-11-04T15:00:00Z'),receipt('qr',573,'2050-11-04T16:00:00Z')]);
 closed('2050-11-04T18:00:00Z','2050-11-05T01:30:00Z','afternoon',336,[receipt('cash',664,'2050-11-04T19:00:00Z'),receipt('qr',270,'2050-11-05T01:00:00Z')]);
 check('Morning plus afternoon equals cash 900, QR 843 and total 1743, excluding both openings',()=>{
  const s=summary('2050-11-04');assert.deepEqual(s.summary,{cash:900,qr:843,other:0,total:1743,receipts:4});assert.equal(s.shifts[0].total,809);assert.equal(s.shifts[1].total,934);assert.deepEqual(summary('2050-11-04','staff'),s);
 });
 check('The next day starts at zero without deleting previous sales or changing physical cash',()=>{
  const saved=fingerprint();assert.equal(summary('2050-11-05').summary.total,0);assert.equal(summary('2050-11-04').summary.total,1743);assert.equal(fingerprint(),saved);
 });
 closed('2050-11-05T03:50:00Z','2050-11-05T04:02:00Z','afternoon',1000,[receipt('cash',7,'2050-11-05T03:59:59Z'),receipt('qr',11,'2050-11-05T04:00:00Z')]);
 closed('2050-11-05T14:00:00Z','2050-11-05T18:00:00Z','morning',1004.6,[{...receipt('cash',-5,'2050-11-05T15:00:00Z'),kind:'adjustment'}, {...receipt('qr',10,'2050-11-05T16:00:00Z'),purchase_type:'employee'}]);
 check('Bolivia midnight splits receipts independently of closing time and keeps refunds and employee purchases',()=>{
  assert.equal(summary('2050-11-04').summary.cash,907);assert.deepEqual(summary('2050-11-05').summary,{cash:-5,qr:21,other:0,total:16,receipts:3});assert.equal(summary('2050-11-06').summary.total,0);
 });
 check('Daily drawer summary is restricted to active cashiers/admin and rejects unsupported dates',()=>{
  for(const who of ['anon','cook','barista','inactive','missing'])denied(who,"select public.get_cashbox_daily_summary('2050-11-04')",'42501');
  for(const day of ['1999-12-31','2100-01-01'])denied('admin',`select public.get_cashbox_daily_summary('${day}')`,'22023');
  assert.equal(read("select has_function_privilege('anon','private.cashbox_daily_summary(date)','execute')"),'f');
  denied('cook',"select private.cashbox_daily_summary('2050-11-04')",'42501');
 });
}

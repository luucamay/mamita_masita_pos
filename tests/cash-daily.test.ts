import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normalizeCashDaily} from '../lib/cash-daily.ts';
const value=()=>({date:'2026-11-04',today:'2026-11-04',summary:{cash:'900',qr:'843',other:0,total:'1743',receipts:4},shifts:[{slot:'morning',label:'Mañana',cash:'236',qr:'573',other:0,total:'809',receipts:2},{slot:'afternoon',label:'Tarde',cash:'664',qr:'270',other:0,total:'934',receipts:2}]});
test('Daily cash report reconciles both shifts as numeric net sales',()=>{const d=normalizeCashDaily(value());assert.equal(d.summary.total,1743);assert.equal(d.summary.qr,843);assert.equal(d.shifts[0].total,809);});
test('Daily cash report rejects incomplete, nonfinite or unreconciled amounts',()=>{
 for(const modify of [(v:ReturnType<typeof value>)=>v.summary.total='1744',(v:ReturnType<typeof value>)=>v.summary.cash='NaN',(v:ReturnType<typeof value>)=>v.shifts.reverse(),(v:ReturnType<typeof value>)=>v.shifts.pop(),(v:ReturnType<typeof value>)=>v.date='2026-02-30']){const v=value();modify(v);assert.throws(()=>normalizeCashDaily(v));}
});

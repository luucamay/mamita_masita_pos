import {validReportDate} from './report-filters.ts';
type Totals={cash:number;qr:number;other:number;total:number;receipts:number};
export type CashDaily={date:string;today:string;summary:Totals;shifts:(Totals&{slot:'morning'|'afternoon';label:string})[]};
export function normalizeCashDaily(value:unknown):CashDaily{
 const d=value as CashDaily;
 if(!d||!validReportDate(d.date)||!validReportDate(d.today)||!d.summary||!Array.isArray(d.shifts)||d.shifts.length!==2)throw Error('No se pudo verificar el resumen diario.');
 function totals(v:Totals):Totals{
  const n=(x:unknown)=>{if((typeof x!=='number'&&typeof x!=='string')||x===''||!Number.isFinite(Number(x)))throw Error('Importe diario inválido.');return Number(x);};
  const t={cash:n(v.cash),qr:n(v.qr),other:n(v.other),total:n(v.total),receipts:n(v.receipts)};
  if(!Number.isInteger(t.receipts)||t.receipts<0||Math.abs(t.total-t.cash-t.qr-t.other)>0.001)throw Error('Totales diarios inconsistentes.');return t;
 }
 const summary=totals(d.summary),shifts=d.shifts.map((s,i)=>{if(s.slot!==(i===0?'morning':'afternoon'))throw Error('Turnos diarios inválidos.');return {...s,...totals(s)};});
 for(const key of ['cash','qr','other','total','receipts'] as const)if(Math.abs(summary[key]-shifts.reduce((sum,s)=>sum+s[key],0))>0.001)throw Error('Turnos diarios inconsistentes.');
 return {...d,summary,shifts};
}

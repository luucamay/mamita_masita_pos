import {validSalesRange} from "./employee-sales.ts";
export type CashReceipt = {source_kind:"payment"|"movement";source_id:string;order_id:string;order_number:string;recorded_at:string;method:"cash"|"qr"|"card";amount:number;kind:"initial"|"adjustment";received_by:string;receiver_name:string;purchase_type:"customer"|"employee"};
export type CashShift = {
 id:string;cashier_id:string;cashier_name:string;opened_at:string;opening_cash:number;opening_note:string;previous_shift_id:string|null;status:"open"|"awaiting_receipt"|"received";
 closed_at:string|null;closed_by:string|null;closed_by_name:string|null;cash_net:number;qr_net:number;other_net:number;receipt_count:number;counted_cash:number|null;withdrawal:number;cash_left:number|null;difference:number|null;close_note:string;closing_snapshot:CashReceipt[];
 received_at:string|null;received_by:string|null;received_by_name:string|null;received_cash:number|null;receipt_difference:number|null;receipt_note:string;
};
export type CashContext = {version:1;actor_id:string;server_time:string;enabled:boolean;shift:CashShift|null;receipts:CashReceipt[];digest:string;summary:{cash:number;qr:number;other:number;receipts:number;expected_cash:number}};
export type CashHistory = {range:{start:string;end:string;today:string};page:number;page_size:25;total_count:number;shifts:CashShift[]};
const amount=(n:unknown)=>{if((typeof n!=="string"&&typeof n!=="number")||n===""||!Number.isFinite(Number(n)))throw Error("Importe de caja inválido");return Number(n);};
export function normalizeCashShift(value:unknown):CashShift{
 const s=value as CashShift;if(!s||!s.id||!["open","awaiting_receipt","received"].includes(s.status)||!Array.isArray(s.closing_snapshot))throw Error("Turno de caja inválido");
 const result={...s};
 for(const key of ["opening_cash","cash_net","qr_net","other_net","withdrawal"] as const)result[key]=amount(s[key]);
 for(const key of ["counted_cash","cash_left","difference","received_cash","receipt_difference"] as const)result[key]=s[key]===null?null:amount(s[key]);
 result.closing_snapshot=s.closing_snapshot.map(r=>({...r,amount:amount(r.amount)}));return result;
}
export function normalizeCashContext(value:unknown):CashContext{
 const c=value as CashContext;if(!c||c.version!==1||!c.actor_id||!Number.isFinite(Date.parse(c.server_time))||!Array.isArray(c.receipts)||!c.summary||!c.digest)throw Error("No se pudo verificar la caja");
 return {...c,shift:c.shift?normalizeCashShift(c.shift):null,receipts:c.receipts.map(r=>({...r,amount:amount(r.amount)})),summary:{cash:amount(c.summary.cash),qr:amount(c.summary.qr),other:amount(c.summary.other),receipts:amount(c.summary.receipts),expected_cash:amount(c.summary.expected_cash)}};
}
export function normalizeCashHistory(value:unknown):CashHistory{
 const h=value as CashHistory;if(!h||!h.range||!validSalesRange(h.range.start,h.range.end)||!Array.isArray(h.shifts)||!Number.isInteger(h.total_count)||h.total_count<0||h.page_size!==25||!Number.isInteger(h.page)||h.page<0)throw Error("Historial de caja inválido");
 return {...h,shifts:h.shifts.map(normalizeCashShift)};
}

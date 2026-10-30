import type {CashContext,CashHistory,CashShift} from "./cashbox";
export const qaCashActor="fcfe27e4-1061-4d2f-b55b-7ba2dbdf602d";
export const qaCashPrevious="00000000-0000-4000-8000-000000009810";
export function qaCashShift(actor=qaCashActor):CashShift{return {
 id:qaCashPrevious,cashier_id:actor,cashier_name:"Ana QA",opened_at:"2026-10-30T14:00:00Z",opening_cash:100,opening_note:"",previous_shift_id:null,status:"open",closed_at:null,closed_by:null,closed_by_name:null,cash_net:0,qr_net:0,other_net:0,receipt_count:0,counted_cash:null,withdrawal:0,cash_left:null,difference:null,close_note:"",closing_snapshot:[],received_at:null,received_by:null,received_by_name:null,received_cash:null,receipt_difference:null,receipt_note:""
};}
export function qaCashContext(state="empty",actor=qaCashActor):CashContext{
 const shift=state==="empty"?null:qaCashShift(state==="pending"?"00000000-0000-4000-8000-000000009899":actor);
 const receipts=[{source_kind:"payment" as const,source_id:"00000000-0000-4000-8000-000000009820",order_id:"00000000-0000-4000-8000-000000009830",order_number:"QA-CAJA-1",recorded_at:"2026-10-30T15:00:00Z",method:"cash" as const,amount:50,kind:"initial" as const,received_by:actor,receiver_name:"Ana QA",purchase_type:"customer" as const},{source_kind:"payment" as const,source_id:"00000000-0000-4000-8000-000000009821",order_id:"00000000-0000-4000-8000-000000009831",order_number:"QA-CAJA-2",recorded_at:"2026-10-30T15:05:00Z",method:"qr" as const,amount:20,kind:"initial" as const,received_by:actor,receiver_name:"Ana QA",purchase_type:"employee" as const}];
 if(shift&&state==="pending")Object.assign(shift,{status:"awaiting_receipt",closed_at:"2026-10-30T20:00:00Z",closed_by:shift.cashier_id,closed_by_name:"Ana QA",cash_net:50,qr_net:20,receipt_count:2,counted_cash:150,withdrawal:50,cash_left:100,difference:0,close_note:"Retiro autorizado QA",closing_snapshot:receipts});
 return {version:1,actor_id:actor,server_time:"2026-10-30T20:00:00Z",enabled:state!=="empty",shift,receipts:state==="empty"?[]:receipts,digest:"fixture-digest",summary:{cash:state==="empty"?0:50,qr:state==="empty"?0:20,other:0,receipts:state==="empty"?0:2,expected_cash:state==="empty"?0:150}};
}
export function qaCashHistory():CashHistory{return {range:{start:"2026-10-30",end:"2026-10-30",today:"2026-10-30"},page:0,page_size:25,total_count:0,shifts:[]};}

import type {CashContext,CashShift} from "./cashbox";

export type CashSchedule={slot:"morning"|"afternoon";label:string;date:string;starts_at:string;ends_at:string;in_hours:boolean};
export type CashAvailability="checking"|"closed"|"receive"|"expired"|"early"|"outside"|"open";
export function cashAvailability(context:CashContext|null,now=Date.parse(context?.server_time??"")):CashAvailability{
 if(!context)return "checking";
 const shift=context.shift;
 if(shift?.status==="open"){
  if(shift.scheduled_end_at&&now>=Date.parse(shift.scheduled_end_at))return "expired";
  if(shift.scheduled_start_at&&now<Date.parse(shift.scheduled_start_at))return "early";
  return "open";
 }
 if(context.schedule&&!context.schedule.in_hours)return "outside";
 if(shift)return "receive";
 return "closed";
}
export function shiftLabel(shift:CashShift|null|undefined){return shift?.shift_slot==="morning"?"Mañana":shift?.shift_slot==="afternoon"?"Tarde":"Turno";}
const time=new Intl.DateTimeFormat("es-BO",{timeZone:"America/La_Paz",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
export function shiftHours(shift:CashShift|null|undefined){return shift?.scheduled_start_at&&shift.scheduled_end_at?`${time.format(new Date(shift.scheduled_start_at))}–${time.format(new Date(shift.scheduled_end_at))}`:"";}
export function cashAvailabilityMessage(state:CashAvailability){return {
 checking:"Verificando caja…",closed:"Abre la caja y confirma el efectivo inicial antes de registrar pedidos.",receive:"Recibe la caja y confirma el efectivo antes de registrar pedidos.",expired:"Terminó el horario del turno. Cierra y entrega la caja antes de continuar.",early:"El turno todavía no empezó. Revisa el horario de caja.",outside:"Horario de atención: 10:00–21:30, hora de Bolivia.",open:"Caja abierta",
 }[state];}
export function reminderDue(shift:CashShift|null,now:number,snoozedUntil=0){const end=Date.parse(shift?.scheduled_end_at??"");return shift?.status==="open"&&Number.isFinite(end)&&now>=end-300000&&now<end&&now>=snoozedUntil;}

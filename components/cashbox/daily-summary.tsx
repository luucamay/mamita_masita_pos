'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {createClient} from '@/lib/supabase/client';
import {normalizeCashDaily,type CashDaily} from '@/lib/cash-daily';
import {useCashboxUpdates} from '@/lib/use-cashbox-updates';
import {useHeaderRefresh} from '@/lib/use-header-refresh';
import {cashMoney} from './cash-history';
export function DailyCashSummary({refreshToken=0}:{refreshToken?:number}){
 const [data,setData]=useState<CashDaily|null>(null),[date,setDate]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const applied=useRef<string|null>(null),active=useRef<AbortController|null>(null);
 async function load(selected=applied.current,background=false){
  if(background&&active.current)return;
  active.current?.abort();const controller=new AbortController();active.current=controller;setBusy(true);
  try{const result=await createClient().rpc('get_cashbox_daily_summary',{p_date:selected}).abortSignal(controller.signal);if(result.error)throw Error('No se pudo actualizar el resumen del día.');const next=normalizeCashDaily(result.data);if(controller.signal.aborted)return;applied.current=selected;setData(next);setError('');if(!background||!data||selected===null&&date===data.date)setDate(next.date);}
  catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'No se pudo cargar el resumen diario.');}
  finally{if(active.current===controller)active.current=null;if(!controller.signal.aborted)setBusy(false);}
 }
 useEffect(()=>{void load();return()=>active.current?.abort();},[refreshToken]); // eslint-disable-line react-hooks/exhaustive-deps
 useCashboxUpdates(()=>load(applied.current,true),true,true);useHeaderRefresh(()=>void load());
 function apply(e:FormEvent){e.preventDefault();void load(date);}
 return <section aria-label="Ventas del día" className="space-y-2 rounded-xl border border-[var(--border)] bg-white p-3" aria-busy={busy}>
  <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Ventas del día</h2><form onSubmit={apply} className="flex flex-wrap items-center gap-1"><label className="sr-only" htmlFor="cash-day">Fecha de ventas de caja</label><input id="cash-day" type="date" required min="2000-01-01" max="2099-12-31" value={date} onChange={e=>setDate(e.target.value)} className="min-h-11 min-w-0 rounded-lg border border-[var(--border)] bg-white px-2 text-sm"/><button disabled={busy} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-orange-800 disabled:opacity-40">Ver</button><button type="button" disabled={busy} onClick={()=>void load(null)} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-orange-800 disabled:opacity-40">Hoy</button></form></div>
  {error?<p role="alert" className="text-sm text-red-800">{error}<button type="button" disabled={busy} onClick={()=>void load()} className="ml-2 min-h-11 underline">Reintentar</button></p>:null}
  {data?<><p className="text-xs text-[var(--muted)]">{data.date.split('-').reverse().join('/')} · Cobros netos en Bolivia. El efectivo inicial no es una venta.</p><table className="w-full text-xs tabular-nums sm:text-sm"><caption className="sr-only">Ventas por turno y total del día</caption><thead><tr className="border-b border-[var(--border)] text-[var(--muted)]"><th className="py-2 text-left font-medium">Turno</th><th className="py-2 text-right font-medium">Efectivo</th><th className="py-2 text-right font-medium">QR</th><th className="py-2 text-right font-medium">Total</th></tr></thead><tbody>{data.shifts.map(s=><tr key={s.slot} className="border-b border-[var(--border)]"><th scope="row" className="py-2 text-left font-medium">{s.label}</th><td className="py-2 text-right">{cashMoney(s.cash)}</td><td className="py-2 text-right">{cashMoney(s.qr)}</td><td className="py-2 text-right font-semibold">{cashMoney(s.total)}</td></tr>)}</tbody><tfoot><tr className="font-semibold text-orange-900"><th scope="row" className="py-2 text-left">Total día</th><td className="py-2 text-right" data-testid="daily-cash">{cashMoney(data.summary.cash)}</td><td className="py-2 text-right" data-testid="daily-qr">{cashMoney(data.summary.qr)}</td><td className="py-2 text-right" data-testid="daily-total">{cashMoney(data.summary.total)}</td></tr></tfoot></table>{data.summary.other!==0?<p className="text-xs">El total incluye otros pagos: {cashMoney(data.summary.other)}.</p>:null}</>:busy?<p role="status" className="text-xs text-[var(--muted)]">Cargando ventas del día…</p>:null}
 </section>;
}

"use client";

export function PaymentObservation({value,onChange,disabled=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean}) {
  return <label className="block text-sm font-medium">Observación del cobro <span className="font-normal text-[var(--muted)]">(opcional)</span>
    <textarea value={value} onChange={event=>onChange(event.target.value)} disabled={disabled} maxLength={500} rows={2} placeholder="Ej.: Se cobró la promoción de cappuccinos por acuerdo con la encargada." className="mt-1 block w-full resize-y rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-base font-normal outline-none focus:ring-2 focus:ring-orange-200 disabled:opacity-60"/>
    <span className="mt-1 block text-xs font-normal text-[var(--muted)]">Se verá en caja y reportes. Confirma el pago solo si lo recibiste.</span>
  </label>;
}

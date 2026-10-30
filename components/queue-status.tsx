export function QueueStatus({status,onRefresh}:{status:string;onRefresh:()=>void}){
  return <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]"><p role="status" data-testid="queue-status">{status}</p><button type="button" onClick={onRefresh} className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-4 font-semibold">Actualizar cola</button></div>;
}

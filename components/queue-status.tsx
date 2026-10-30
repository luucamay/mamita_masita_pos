export function QueueStatus({status}:{status:string;onRefresh?:()=>void}){
  return <p role="status" data-testid="queue-status" className="mb-2 text-xs text-[var(--muted)]">{status}</p>;
}
